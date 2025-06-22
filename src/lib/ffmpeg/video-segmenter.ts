import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import type { VideoSegments, VideoMetadata } from '@/types';

export class VideoSegmenter {
  private ffmpeg: FFmpeg;
  private isLoaded = false;

  constructor() {
    this.ffmpeg = new FFmpeg();
  }

  async initialize(): Promise<void> {
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
      
      // Clean up any existing files first
      try {
        await this.ffmpeg.deleteFile('input.mp4');
      } catch (e) {
        // File doesn't exist, that's fine
      }
      
      // Write input file to FFmpeg filesystem
      const fileData = await fetchFile(file);
      await this.ffmpeg.writeFile('input.mp4', fileData);

      // Extract metadata first
      const metadata = await this.extractMetadata();
      console.log('Video metadata:', metadata);

      // Set up progress monitoring
      this.ffmpeg.on('progress', ({ progress }) => {
        onProgress?.(Math.round(progress * 100));
      });

      // Clean up any existing output files
      try {
        const files = await this.ffmpeg.listDir('/');
        for (const file of files) {
          if (file.name.includes('segment_') || file.name === 'playlist.m3u8') {
            await this.ffmpeg.deleteFile(file.name);
          }
        }
      } catch (e) {
        // Files don't exist, that's fine
      }

      // Segment video into 5-second TS files
      await this.ffmpeg.exec([
        '-i', 'input.mp4',
        '-c', 'copy', // Copy streams without re-encoding for speed
        '-f', 'hls',
        '-hls_time', '5', // 5-second segments
        '-hls_list_size', '0', // Keep all segments in playlist
        '-hls_segment_filename', 'segment_%03d.ts',
        'playlist.m3u8'
      ]);

      // Generate thumbnails (1 per second)
      await this.generateThumbnails(metadata.duration);

      // Extract audio for waveform
      const waveform = await this.generateWaveform();

      // Collect all generated files
      const segments = await this.collectSegments();
      const thumbnails = await this.collectThumbnails();
      const playlistContent = await this.ffmpeg.readFile('playlist.m3u8');
      const playlistUrl = URL.createObjectURL(
        new Blob([playlistContent], { type: 'application/vnd.apple.mpegurl' })
      );

      console.log(`Generated ${segments.length} segments and ${thumbnails.length} thumbnails`);

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
    // Use ffprobe to extract metadata
    await this.ffmpeg.exec([
      '-i', 'input.mp4',
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

  private async generateThumbnails(duration: number): Promise<void> {
    // Generate thumbnails every 1 second
    const thumbnailInterval = 1; // seconds
    const thumbnailCount = Math.ceil(duration / thumbnailInterval);

    console.log(`Generating ${thumbnailCount} thumbnails...`);

    await this.ffmpeg.exec([
      '-i', 'input.mp4',
      '-vf', `fps=1/${thumbnailInterval}`, // 1 frame per second
      '-q:v', '2', // High quality JPEG
      '-f', 'image2',
      'thumb_%03d.jpg'
    ]);
  }

  private async generateWaveform(): Promise<Float32Array> {
    console.log('Generating audio waveform...');

    // Extract audio and convert to raw PCM data
    await this.ffmpeg.exec([
      '-i', 'input.mp4',
      '-ac', '1', // Convert to mono
      '-ar', '8000', // Low sample rate for waveform
      '-f', 'f32le', // 32-bit float little endian
      'audio.raw'
    ]);

    const audioBuffer = await this.ffmpeg.readFile('audio.raw');
    const floatArray = new Float32Array(audioBuffer.buffer);

    // Downsample for UI (1000 samples max)
    const targetSamples = 1000;
    const blockSize = Math.floor(floatArray.length / targetSamples);
    const waveform = new Float32Array(targetSamples);

    for (let i = 0; i < targetSamples; i++) {
      let peak = 0;
      for (let j = 0; j < blockSize; j++) {
        const sample = Math.abs(floatArray[i * blockSize + j] || 0);
        if (sample > peak) peak = sample;
      }
      waveform[i] = peak;
    }

    console.log(`Generated waveform with ${waveform.length} samples`);
    return waveform;
  }

  private async collectSegments(): Promise<Blob[]> {
    const segments: Blob[] = [];
    let segmentIndex = 0;

    // Read segments until we can't find any more
    while (true) {
      try {
        const filename = `segment_${segmentIndex.toString().padStart(3, '0')}.ts`;
        const segmentData = await this.ffmpeg.readFile(filename);
        segments.push(new Blob([segmentData], { type: 'video/mp2t' }));
        segmentIndex++;
      } catch {
        // No more segments
        break;
      }
    }

    return segments;
  }

  private async collectThumbnails(): Promise<Blob[]> {
    const thumbnails: Blob[] = [];
    let thumbnailIndex = 1; // FFmpeg starts at 1

    // Read thumbnails until we can't find any more
    while (true) {
      try {
        const filename = `thumb_${thumbnailIndex.toString().padStart(3, '0')}.jpg`;
        const thumbnailData = await this.ffmpeg.readFile(filename);
        thumbnails.push(new Blob([thumbnailData], { type: 'image/jpeg' }));
        thumbnailIndex++;
      } catch {
        // No more thumbnails
        break;
      }
    }

    return thumbnails;
  }

  private async cleanup(): Promise<void> {
    try {
      // List all files in FFmpeg filesystem
      const files = await this.ffmpeg.listDir('/');
      
      // Remove all generated files
      for (const file of files) {
        if (file.isFile) {
          await this.ffmpeg.deleteFile(file.name);
        }
      }
    } catch (error) {
      console.warn('Cleanup failed:', error);
    }
  }

  // Utility method to check browser support
  static isSupported(): boolean {
    return typeof SharedArrayBuffer !== 'undefined' && 
           typeof WebAssembly !== 'undefined' &&
           typeof Worker !== 'undefined';
  }

  // Utility method to get supported video formats
  static getSupportedFormats(): string[] {
    return ['video/mp4', 'video/quicktime', 'video/x-msvideo'];
  }

  // Utility method to validate file
  static validateVideoFile(file: File): { valid: boolean; error?: string } {
    // Check file size (max 3GB as specified)
    const maxSize = 3 * 1024 * 1024 * 1024; // 3GB
    if (file.size > maxSize) {
      return { valid: false, error: 'File size exceeds 3GB limit' };
    }

    // Check file type
    if (!file.type.startsWith('video/')) {
      return { valid: false, error: 'Invalid file type. Only video files are supported.' };
    }

    // Check for MP4 H.264 (preferred format)
    if (file.type !== 'video/mp4') {
      return { valid: false, error: 'Only MP4 files are supported in this version.' };
    }

    return { valid: true };
  }
}

export default VideoSegmenter;