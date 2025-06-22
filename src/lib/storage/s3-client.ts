import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import type { VideoSegments, VideoAsset } from '@/types';

export interface S3Config {
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
}

export class S3VideoStorage {
  private s3Client: S3Client;
  private bucket: string;

  constructor(config: S3Config) {
    this.s3Client = new S3Client({
      region: config.region,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
    this.bucket = config.bucket;
  }

  async uploadVideoAsset(
    projectId: string,
    videoId: string,
    segments: VideoSegments,
    onProgress?: (progress: number) => void
  ): Promise<VideoAsset> {
    try {
      console.log(`Uploading video asset ${videoId} for project ${projectId}`);

      // Upload all components in parallel
      const [segmentUrls, thumbnailUrls, playlistUrl] = await Promise.all([
        this.uploadSegments(projectId, videoId, segments.segments, onProgress),
        this.uploadThumbnails(projectId, videoId, segments.thumbnails),
        this.uploadPlaylist(projectId, videoId, segments.playlistUrl),
      ]);

      // Upload waveform data
      const waveformUrl = await this.uploadWaveform(projectId, videoId, segments.waveform);

      // Create video asset object
      const videoAsset: VideoAsset = {
        id: videoId,
        originalUrl: '', // This would be set when uploading original file
        segmentsUrl: playlistUrl, // URL to the M3U8 playlist
        thumbnailUrls,
        waveformData: segments.waveform.buffer,
        metadata: segments.metadata
      };

      console.log(`Successfully uploaded video asset with ${segmentUrls.length} segments`);
      return videoAsset;

    } catch (error) {
      console.error('Failed to upload video asset:', error);
      throw new Error('Failed to upload video to storage');
    }
  }

  private async uploadSegments(
    projectId: string,
    videoId: string,
    segments: Blob[],
    onProgress?: (progress: number) => void
  ): Promise<string[]> {
    const uploadPromises = segments.map(async (segment, index) => {
      const key = `projects/${projectId}/videos/${videoId}/segments/segment_${index.toString().padStart(3, '0')}.ts`;
      
      const upload = new Upload({
        client: this.s3Client,
        params: {
          Bucket: this.bucket,
          Key: key,
          Body: segment,
          ContentType: 'video/mp2t',
          CacheControl: 'max-age=31536000', // Cache for 1 year
        },
      });

      // Track progress for this segment
      upload.on('httpUploadProgress', (progress) => {
        if (onProgress && progress.loaded && progress.total) {
          const segmentProgress = (progress.loaded / progress.total) * 100;
          const totalProgress = ((index + segmentProgress / 100) / segments.length) * 100;
          onProgress(Math.round(totalProgress));
        }
      });

      await upload.done();
      return this.getPublicUrl(key);
    });

    return Promise.all(uploadPromises);
  }

  private async uploadThumbnails(
    projectId: string,
    videoId: string,
    thumbnails: Blob[]
  ): Promise<string[]> {
    const uploadPromises = thumbnails.map(async (thumbnail, index) => {
      const key = `projects/${projectId}/videos/${videoId}/thumbnails/thumb_${index.toString().padStart(3, '0')}.jpg`;
      
      await this.s3Client.send(new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: thumbnail,
        ContentType: 'image/jpeg',
        CacheControl: 'max-age=31536000', // Cache for 1 year
      }));

      return this.getPublicUrl(key);
    });

    return Promise.all(uploadPromises);
  }

  private async uploadPlaylist(
    projectId: string,
    videoId: string,
    playlistUrl: string
  ): Promise<string> {
    // Fetch the playlist content
    const response = await fetch(playlistUrl);
    const playlistContent = await response.text();

    // Update playlist to use S3 URLs for segments
    const updatedPlaylist = this.updatePlaylistUrls(playlistContent, projectId, videoId);

    const key = `projects/${projectId}/videos/${videoId}/playlist.m3u8`;
    
    await this.s3Client.send(new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: updatedPlaylist,
      ContentType: 'application/vnd.apple.mpegurl',
      CacheControl: 'max-age=3600', // Cache for 1 hour
    }));

    return this.getPublicUrl(key);
  }

  private async uploadWaveform(
    projectId: string,
    videoId: string,
    waveform: Float32Array
  ): Promise<string> {
    const key = `projects/${projectId}/videos/${videoId}/waveform.bin`;
    
    await this.s3Client.send(new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: waveform.buffer,
      ContentType: 'application/octet-stream',
      CacheControl: 'max-age=31536000', // Cache for 1 year
    }));

    return this.getPublicUrl(key);
  }

  private updatePlaylistUrls(playlistContent: string, projectId: string, videoId: string): string {
    // Replace local segment URLs with S3 URLs
    return playlistContent.replace(/segment_(\d+)\.ts/g, (match, segmentNumber) => {
      const key = `projects/${projectId}/videos/${videoId}/segments/segment_${segmentNumber}.ts`;
      return this.getPublicUrl(key);
    });
  }

  async downloadWaveform(projectId: string, videoId: string): Promise<Float32Array> {
    const key = `projects/${projectId}/videos/${videoId}/waveform.bin`;
    
    try {
      const response = await this.s3Client.send(new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }));

      if (response.Body) {
        const arrayBuffer = await response.Body.transformToByteArray();
        return new Float32Array(arrayBuffer.buffer);
      } else {
        throw new Error('No waveform data found');
      }
    } catch (error) {
      console.error('Failed to download waveform:', error);
      throw new Error('Failed to load waveform data');
    }
  }

  async getThumbnailUrl(projectId: string, videoId: string, thumbnailIndex: number): Promise<string> {
    const key = `projects/${projectId}/videos/${videoId}/thumbnails/thumb_${thumbnailIndex.toString().padStart(3, '0')}.jpg`;
    return this.getPublicUrl(key);
  }

  async getPlaylistUrl(projectId: string, videoId: string): Promise<string> {
    const key = `projects/${projectId}/videos/${videoId}/playlist.m3u8`;
    return this.getPublicUrl(key);
  }

  private getPublicUrl(key: string): string {
    // For public S3 buckets, construct the URL directly
    // For private buckets, you would use getSignedUrl instead
    return `https://${this.bucket}.s3.amazonaws.com/${key}`;
  }

  // Helper method to validate S3 configuration
  static validateConfig(config: Partial<S3Config>): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!config.region) errors.push('AWS region is required');
    if (!config.accessKeyId) errors.push('AWS access key ID is required');
    if (!config.secretAccessKey) errors.push('AWS secret access key is required');
    if (!config.bucket) errors.push('S3 bucket name is required');

    return {
      valid: errors.length === 0,
      errors
    };
  }

  // Helper method to test S3 connectivity
  async testConnection(): Promise<boolean> {
    try {
      // Try to list objects with a limit of 1 to test connection
      await this.s3Client.send(new GetObjectCommand({
        Bucket: this.bucket,
        Key: 'test-connection', // This file doesn't need to exist
      }));
      return true;
    } catch (error: any) {
      // If the error is "NoSuchKey", it means we can connect but the file doesn't exist
      // If it's a permission or connection error, we'll get a different error
      if (error.name === 'NoSuchKey') {
        return true;
      }
      console.error('S3 connection test failed:', error);
      return false;
    }
  }
}

export default S3VideoStorage;