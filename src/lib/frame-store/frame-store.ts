import type { FrameCache } from '@/types';

// LRU Cache implementation for video frames
class LRUCache<K, V> {
  private cache = new Map<K, V>();
  private maxSize: number;

  constructor(maxSize: number) {
    this.maxSize = maxSize;
  }

  get(key: K): V | undefined {
    const value = this.cache.get(key);
    if (value !== undefined) {
      // Move to end (most recently used)
      this.cache.delete(key);
      this.cache.set(key, value);
    }
    return value;
  }

  set(key: K, value: V): void {
    if (this.cache.has(key)) {
      // Update existing
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      // Remove least recently used (first item)
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    this.cache.set(key, value);
  }

  has(key: K): boolean {
    return this.cache.has(key);
  }

  clear(): void {
    this.cache.clear();
  }

  size(): number {
    return this.cache.size;
  }
}

export interface FrameRequest {
  videoId: string;
  frameNumber: number;
  priority: number; // Higher = more important
  timestamp: number;
}

export class FrameStore {
  private frameCache: LRUCache<string, VideoFrame | ImageBitmap>;
  private thumbnailCache: LRUCache<string, HTMLImageElement>;
  private priorityQueue: FrameRequest[] = [];
  private isProcessing = false;
  private videoElements = new Map<string, HTMLVideoElement>();
  private canvasPool: OffscreenCanvas[] = [];
  
  // Configuration
  private readonly maxFrames: number;
  private readonly maxThumbnails: number;
  private readonly maxCanvasPool: number;

  constructor(config?: {
    maxFrames?: number;
    maxThumbnails?: number;
    maxCanvasPool?: number;
  }) {
    this.maxFrames = config?.maxFrames || 1000;
    this.maxThumbnails = config?.maxThumbnails || 2000;
    this.maxCanvasPool = config?.maxCanvasPool || 10;

    this.frameCache = new LRUCache(this.maxFrames);
    this.thumbnailCache = new LRUCache(this.maxThumbnails);

    // Initialize canvas pool
    for (let i = 0; i < this.maxCanvasPool; i++) {
      this.canvasPool.push(new OffscreenCanvas(1920, 1080));
    }
  }

  // Add a video clip to the store
  async addClip(videoId: string, playlistUrl: string): Promise<void> {
    try {
      // Create video element for this clip
      const video = document.createElement('video');
      video.crossOrigin = 'anonymous';
      video.preload = 'metadata';
      video.src = playlistUrl;

      // Wait for metadata to load
      await new Promise<void>((resolve, reject) => {
        video.addEventListener('loadedmetadata', () => resolve());
        video.addEventListener('error', () => reject(new Error('Failed to load video metadata')));
      });

      this.videoElements.set(videoId, video);
      console.log(`Added video clip ${videoId} to frame store`);
    } catch (error) {
      console.error(`Failed to add video clip ${videoId}:`, error);
      throw error;
    }
  }

  // Get a frame from cache or request it
  async getFrame(videoId: string, frameNumber: number): Promise<VideoFrame | ImageBitmap | null> {
    const key = this.getFrameKey(videoId, frameNumber);
    
    // Check cache first
    const cachedFrame = this.frameCache.get(key);
    if (cachedFrame) {
      return cachedFrame;
    }

    // Add to priority queue for async loading
    this.addToQueue({
      videoId,
      frameNumber,
      priority: 1,
      timestamp: Date.now()
    });

    return null;
  }

  // Get a thumbnail from cache or request it
  async getThumbnail(videoId: string, timeInSeconds: number): Promise<HTMLImageElement | null> {
    const key = this.getThumbnailKey(videoId, timeInSeconds);
    
    // Check cache first
    const cachedThumbnail = this.thumbnailCache.get(key);
    if (cachedThumbnail) {
      return cachedThumbnail;
    }

    // Load thumbnail asynchronously
    this.loadThumbnail(videoId, timeInSeconds);
    return null;
  }

  // Prioritize frames for a time range (e.g., visible timeline)
  prioritize(videoId: string, startFrame: number, endFrame: number, fps: number = 30): void {
    const currentTime = Date.now();
    
    // Add frames to priority queue with decreasing priority based on distance from center
    const centerFrame = (startFrame + endFrame) / 2;
    
    for (let frame = startFrame; frame <= endFrame; frame++) {
      const distance = Math.abs(frame - centerFrame);
      const priority = Math.max(1, 10 - distance); // Higher priority for frames near center
      
      this.addToQueue({
        videoId,
        frameNumber: frame,
        priority,
        timestamp: currentTime
      });
    }

    this.processQueue();
  }

  // Force load a specific frame immediately
  async loadFrameImmediate(videoId: string, frameNumber: number, fps: number = 30): Promise<VideoFrame | ImageBitmap | null> {
    const video = this.videoElements.get(videoId);
    if (!video) {
      console.warn(`Video ${videoId} not found in frame store`);
      return null;
    }

    try {
      const timeInSeconds = frameNumber / fps;
      
      // Seek to the specific time
      video.currentTime = timeInSeconds;
      
      // Wait for seek to complete
      await new Promise<void>((resolve) => {
        video.addEventListener('seeked', () => resolve(), { once: true });
      });

      // Capture frame
      const frame = await this.captureVideoFrame(video);
      
      // Cache the frame
      const key = this.getFrameKey(videoId, frameNumber);
      this.frameCache.set(key, frame);
      
      return frame;
    } catch (error) {
      console.error(`Failed to load frame ${frameNumber} for video ${videoId}:`, error);
      return null;
    }
  }

  // Reset the store (clear all caches)
  reset(): void {
    this.frameCache.clear();
    this.thumbnailCache.clear();
    this.priorityQueue = [];
    this.videoElements.clear();
    console.log('Frame store reset');
  }

  // Get cache statistics
  getStats(): {
    framesCached: number;
    thumbnailsCached: number;
    queueLength: number;
    memoryUsage: string;
  } {
    const framesCached = this.frameCache.size();
    const thumbnailsCached = this.thumbnailCache.size();
    
    // Estimate memory usage (rough calculation)
    const estimatedFrameSize = 1920 * 1080 * 4; // RGBA bytes
    const estimatedThumbnailSize = 320 * 180 * 4; // Smaller thumbnails
    const estimatedMemory = (framesCached * estimatedFrameSize) + (thumbnailsCached * estimatedThumbnailSize);
    
    return {
      framesCached,
      thumbnailsCached,
      queueLength: this.priorityQueue.length,
      memoryUsage: this.formatBytes(estimatedMemory)
    };
  }

  // Private methods
  private getFrameKey(videoId: string, frameNumber: number): string {
    return `${videoId}_frame_${frameNumber}`;
  }

  private getThumbnailKey(videoId: string, timeInSeconds: number): string {
    return `${videoId}_thumb_${Math.floor(timeInSeconds)}`;
  }

  private addToQueue(request: FrameRequest): void {
    // Check if already in queue
    const exists = this.priorityQueue.some(
      req => req.videoId === request.videoId && req.frameNumber === request.frameNumber
    );
    
    if (!exists) {
      this.priorityQueue.push(request);
      
      // Sort by priority (highest first)
      this.priorityQueue.sort((a, b) => b.priority - a.priority);
      
      // Limit queue size
      if (this.priorityQueue.length > 1000) {
        this.priorityQueue = this.priorityQueue.slice(0, 1000);
      }
    }
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessing || this.priorityQueue.length === 0) return;
    
    this.isProcessing = true;
    
    try {
      // Process up to 5 requests at a time
      const batch = this.priorityQueue.splice(0, 5);
      
      await Promise.all(batch.map(async (request) => {
        const key = this.getFrameKey(request.videoId, request.frameNumber);
        
        // Skip if already cached
        if (this.frameCache.has(key)) return;
        
        try {
          const frame = await this.loadFrameImmediate(request.videoId, request.frameNumber);
          if (frame) {
            this.frameCache.set(key, frame);
          }
        } catch (error) {
          console.warn(`Failed to load frame ${request.frameNumber} for video ${request.videoId}:`, error);
        }
      }));
      
      // Continue processing if there are more requests
      if (this.priorityQueue.length > 0) {
        setTimeout(() => this.processQueue(), 10);
      }
    } finally {
      this.isProcessing = false;
    }
  }

  private async loadThumbnail(videoId: string, timeInSeconds: number): Promise<void> {
    // For thumbnails, we can use a simpler approach with video.currentTime
    const video = this.videoElements.get(videoId);
    if (!video) return;

    try {
      video.currentTime = timeInSeconds;
      
      await new Promise<void>((resolve) => {
        video.addEventListener('seeked', () => resolve(), { once: true });
      });

      const canvas = this.getCanvasFromPool();
      const ctx = canvas.getContext('2d')!;
      
      // Draw smaller thumbnail
      canvas.width = 320;
      canvas.height = 180;
      ctx.drawImage(video, 0, 0, 320, 180);
      
      // Convert to image element
      const blob = await canvas.convertToBlob();
      const img = new Image();
      img.src = URL.createObjectURL(blob);
      
      const key = this.getThumbnailKey(videoId, timeInSeconds);
      this.thumbnailCache.set(key, img);
      
      this.returnCanvasToPool(canvas);
    } catch (error) {
      console.warn(`Failed to load thumbnail for video ${videoId} at time ${timeInSeconds}:`, error);
    }
  }

  private async captureVideoFrame(video: HTMLVideoElement): Promise<VideoFrame | ImageBitmap> {
    // Try to use VideoFrame if supported (Chrome with WebCodecs)
    if (typeof VideoFrame !== 'undefined') {
      return new VideoFrame(video);
    }
    
    // Fallback to ImageBitmap
    const canvas = this.getCanvasFromPool();
    const ctx = canvas.getContext('2d')!;
    
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0);
    
    const bitmap = await createImageBitmap(canvas);
    this.returnCanvasToPool(canvas);
    
    return bitmap;
  }

  private getCanvasFromPool(): OffscreenCanvas {
    return this.canvasPool.pop() || new OffscreenCanvas(1920, 1080);
  }

  private returnCanvasToPool(canvas: OffscreenCanvas): void {
    if (this.canvasPool.length < this.maxCanvasPool) {
      // Clear canvas before returning to pool
      const ctx = canvas.getContext('2d')!;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      this.canvasPool.push(canvas);
    }
  }

  private formatBytes(bytes: number): string {
    const sizes = ['B', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 B';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  }
}

export default FrameStore;