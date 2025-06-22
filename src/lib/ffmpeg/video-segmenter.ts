import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import type { VideoSegments, VideoMetadata } from '@/types';

export default class VideoSegmenter {
  private ffmpeg: FFmpeg;
  private isLoaded = false;

  constructor() {
    this.ffmpeg = new FFmpeg();
  }

  // Initialize FFmpeg
  private async initialize(): Promise<void> {
    if (this.isLoaded) return;

    try {
      // Load FFmpeg with CDN URLs
      const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd';
      
      await this.ffmpeg.load({
        coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
      });

      this.isLoaded = true;
      console.log('FFmpeg loaded successfully');
    } catch (error) {
      console.error('Failed to load FFmpeg:', error);
      throw new Error('Failed to initialize video processor');
    }
  }

  async segmentVideo(
    file: File,
    onProgress?: (progress: number) => void
  ): Promise<VideoSegments> {
    await this.initialize();

    try {
      console.log('Starting video segmentation for:', file.name);
      
      // Write input file to FFmpeg filesystem
      console.log('Writing file to FFmpeg filesystem...');
      const fileData = await fetchFile(file);
      await this.ffmpeg.writeFile('input.mp4', fileData);
      console.log('File written successfully');

      // Extract basic metadata
      console.log('Extracting metadata...');
      let metadata;
      try {
        metadata = await this.extractMetadata();
        console.log('Video metadata:', metadata);
      } catch (metaError) {
        console.warn('Metadata extraction failed, using defaults:', metaError);
        metadata = {
          duration: 60, // Default 1 minute
          width: 1920,
          height: 1080,
          fps: 30,
          bitrate: 5000000,
          codec: 'h264',
          size: file.size
        };
      }

      // Set up progress monitoring
      this.ffmpeg.on('progress', ({ progress }) => {
        onProgress?.(Math.round(progress * 100));
      });

      // Simple segmentation without complex cleanup
      console.log('Starting video segmentation...');
      await this.ffmpeg.exec([
        '-i', 'input.mp4',
        '-c', 'copy', // Copy streams without re-encoding
        '-f', 'hls',
        '-hls_time', '5', // 5-second segments
        '-hls_list_size', '0', // Keep all segments
        '-hls_segment_filename', 'segment_%03d.ts',
        '-y', // Overwrite existing files
        'playlist.m3u8'
      ]);
      console.log('Video segmentation completed');

      // Generate simple thumbnails
      console.log('Generating thumbnails...');
      const thumbnails = await this.generateSimpleThumbnails(metadata.duration);

      // Generate simple waveform
      console.log('Generating waveform...');
      const waveform = await this.generateSimpleWaveform();

      // Collect segments
      console.log('Collecting segments...');
      const segments = await this.collectSegments();
      
      // Read playlist
      const playlistContent = await this.ffmpeg.readFile('playlist.m3u8');
      const playlistUrl = URL.createObjectURL(
        new Blob([playlistContent], { type: 'application/vnd.apple.mpegurl' })
      );

      console.log('Video processing completed successfully');

      return {
        segments,
        metadata,
        thumbnails,
        waveform,
        playlistUrl
      };

    } catch (error) {
      console.error('Video segmentation failed:', error);
      
      // Clean up on error
      try {
        await this.ffmpeg.deleteFile('input.mp4');
      } catch (e) {
        // Ignore cleanup errors
      }
      
      if (error instanceof Error) {
        throw new Error(`Video processing failed: ${error.message}`);
      } else {
        throw new Error('Failed to process video file');
      }
    } finally {
      // Clean up FFmpeg filesystem
      await this.cleanup();
    }
  }

  private async extractMetadata(): Promise<VideoMetadata> {
    await this.ffmpeg.exec([
      '-i', 'input.mp4',
      '-f', 'ffprobe',
      '-v', 'quiet',
      '-print_format', 'json',
      '-show_format',
      '-show_streams',
      'metadata.json'
    ]);

    const metadataBuffer = await this.ffmpeg.readFile('metadata.json');
    const metadataText = new TextDecoder().decode(metadataBuffer);
    const metadata = JSON.parse(metadataText);

    // Extract video stream info
    const videoStream = metadata.streams.find((s: any) => s.codec_type === 'video');
    const format = metadata.format;

    return {
      duration: parseFloat(format.duration),
      width: videoStream.width,
      height: videoStream.height,
      fps: eval(videoStream.r_frame_rate), // e.g., "30/1" -> 30
      bitrate: parseInt(format.bit_rate),
      codec: videoStream.codec_name,
      size: parseInt(format.size)
    };
  }

  private async generateSimpleThumbnails(duration: number): Promise<Blob[]> {
    console.log('Generating simple thumbnails for duration:', duration);
    
    try {
      // Generate just 3 thumbnails for now to avoid FS issues
      const thumbnails: Blob[] = [];
      const times = [0, duration / 2, Math.max(0, duration - 1)];
      
      for (let i = 0; i < times.length; i++) {
        try {
          await this.ffmpeg.exec([
            '-i', 'input.mp4',
            '-ss', times[i].toString(),
            '-vframes', '1',
            '-q:v', '2',
            '-f', 'image2',
            '-y',
            `thumb_${i}.jpg`
          ]);
          
          const thumbData = await this.ffmpeg.readFile(`thumb_${i}.jpg`);
          thumbnails.push(new Blob([thumbData], { type: 'image/jpeg' }));
        } catch (thumbError) {
          console.warn(`Failed to generate thumbnail ${i}:`, thumbError);
          // Create a placeholder thumbnail
          thumbnails.push(await this.createPlaceholderThumbnail(i));
        }
      }
      
      return thumbnails;
    } catch (error) {
      console.warn('Thumbnail generation failed, creating placeholders:', error);
      // Return placeholder thumbnails
      const placeholders: Blob[] = [];
      for (let i = 0; i < 3; i++) {
        placeholders.push(await this.createPlaceholderThumbnail(i));
      }
      return placeholders;
    }
  }

  private async createPlaceholderThumbnail(index: number): Promise<Blob> {
    const canvas = document.createElement('canvas');
    canvas.width = 160;
    canvas.height = 90;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#333';
    ctx.fillRect(0, 0, 160, 90);
    ctx.fillStyle = '#fff';
    ctx.font = '14px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(`Thumb ${index}`, 80, 45);
    
    return new Promise<Blob>((resolve) => {
      canvas.toBlob(resolve!, 'image/jpeg', 0.8);
    });
  }

  private async generateSimpleWaveform(): Promise<Float32Array> {
    console.log('Generating simple waveform data');
    
    try {
      // Try to extract simple audio data
      await this.ffmpeg.exec([
        '-i', 'input.mp4',
        '-vn',
        '-acodec', 'pcm_f32le',
        '-ar', '8000', // Lower sample rate to reduce data
        '-ac', '1',
        '-f', 'f32le',
        '-y',
        'audio.raw'
      ]);

      const audioData = await this.ffmpeg.readFile('audio.raw');
      return new Float32Array(audioData.buffer);
    } catch (error) {
      console.warn('Waveform generation failed, creating placeholder:', error);
      // Return placeholder waveform data
      const length = 1000;
      const waveform = new Float32Array(length);
      for (let i = 0; i < length; i++) {
        waveform[i] = Math.sin(i * 0.1) * 0.5;
      }
      return waveform;
    }
  }

  private async collectSegments(): Promise<Blob[]> {
    const segments: Blob[] = [];
    let segmentIndex = 0;

    try {
      while (true) {
        const segmentName = `segment_${segmentIndex.toString().padStart(3, '0')}.ts`;
        
        try {
          const segmentData = await this.ffmpeg.readFile(segmentName);
          segments.push(new Blob([segmentData], { type: 'video/mp2t' }));
          segmentIndex++;
        } catch (error) {
          // No more segments
          break;
        }
      }
    } catch (error) {
      console.error('Error collecting segments:', error);
    }

    console.log(`Collected ${segments.length} video segments`);
    return segments;
  }

  private async cleanup(): Promise<void> {
    try {
      // Clean up common files
      const filesToClean = ['input.mp4', 'metadata.json', 'audio.raw', 'playlist.m3u8'];
      
      for (const fileName of filesToClean) {
        try {
          await this.ffmpeg.deleteFile(fileName);
        } catch (e) {
          // File doesn't exist, that's fine
        }
      }

      // Clean up segments and thumbnails
      for (let i = 0; i < 100; i++) { // Reasonable limit
        try {
          await this.ffmpeg.deleteFile(`segment_${i.toString().padStart(3, '0')}.ts`);
        } catch (e) {
          // No more segments
        }
        
        try {
          await this.ffmpeg.deleteFile(`thumb_${i}.jpg`);
        } catch (e) {
          // No more thumbnails
        }
      }
      
      console.log('FFmpeg filesystem cleaned');
    } catch (error) {
      console.warn('Cleanup failed:', error);
    }
  }

  // Static validation methods
  static validateVideoFile(file: File): { valid: boolean; error?: string } {
    // Check file type
    if (!file.type.startsWith('video/')) {
      return { valid: false, error: 'Please select a video file' };
    }

    // Check file size (max 3GB)
    const maxSize = 3 * 1024 * 1024 * 1024; // 3GB in bytes
    if (file.size > maxSize) {
      return { valid: false, error: 'File size must be less than 3GB' };
    }

    // Check file format (should be MP4)
    if (file.type !== 'video/mp4') {
      return { valid: false, error: 'Only MP4 H.264 videos are supported' };
    }

    return { valid: true };
  }

  static isSupported(): boolean {
    // Check for required browser features
    return typeof SharedArrayBuffer !== 'undefined' && 
           typeof WebAssembly !== 'undefined' &&
           typeof URL.createObjectURL !== 'undefined';
  }
}