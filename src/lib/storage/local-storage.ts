// Local storage utility for video assets (browser-based)
import type { VideoSegments, VideoAsset } from '@/types';

export interface LocalVideoAsset {
  id: string;
  fileName: string;
  fileSize: number;
  processedAt: Date;
  segmentUrls: string[]; // blob URLs
  thumbnailUrls: string[]; // blob URLs
  playlistContent: string; // M3U8 content
  metadata: VideoSegments['metadata'];
  waveform: Float32Array;
}

class LocalVideoStorage {
  private assets: Map<string, LocalVideoAsset> = new Map();

  // Store processed video with local blob URLs
  storeVideoAsset(
    id: string,
    fileName: string,
    fileSize: number,
    segments: VideoSegments
  ): LocalVideoAsset {
    // Create blob URLs for segments and thumbnails
    const segmentUrls = segments.segments.map(blob => URL.createObjectURL(blob));
    const thumbnailUrls = segments.thumbnails.map(blob => URL.createObjectURL(blob));

    const asset: LocalVideoAsset = {
      id,
      fileName,
      fileSize,
      processedAt: new Date(),
      segmentUrls,
      thumbnailUrls,
      playlistContent: segments.playlistUrl, // This is actually M3U8 content in local mode
      metadata: segments.metadata,
      waveform: segments.waveform,
    };

    this.assets.set(id, asset);
    console.log(`Stored video asset locally: ${fileName} (${segmentUrls.length} segments)`);
    
    return asset;
  }

  // Retrieve video asset
  getVideoAsset(id: string): LocalVideoAsset | null {
    return this.assets.get(id) || null;
  }

  // List all stored assets
  listAssets(): LocalVideoAsset[] {
    return Array.from(this.assets.values());
  }

  // Clean up blob URLs to free memory
  cleanupAsset(id: string): void {
    const asset = this.assets.get(id);
    if (asset) {
      // Revoke all blob URLs to free memory
      asset.segmentUrls.forEach(url => URL.revokeObjectURL(url));
      asset.thumbnailUrls.forEach(url => URL.revokeObjectURL(url));
      
      this.assets.delete(id);
      console.log(`Cleaned up video asset: ${asset.fileName}`);
    }
  }

  // Clean up all assets
  cleanup(): void {
    this.assets.forEach((_, id) => this.cleanupAsset(id));
    console.log('Cleaned up all video assets');
  }

  // Get memory usage stats
  getStats(): {
    assetsCount: number;
    totalSegments: number;
    totalThumbnails: number;
    memoryUsage: string;
  } {
    const assets = this.listAssets();
    const totalSegments = assets.reduce((sum, asset) => sum + asset.segmentUrls.length, 0);
    const totalThumbnails = assets.reduce((sum, asset) => sum + asset.thumbnailUrls.length, 0);
    
    // Rough memory estimate (segments are larger than thumbnails)
    const estimatedMemory = (totalSegments * 2000000) + (totalThumbnails * 200000); // 2MB per segment, 200KB per thumbnail
    
    return {
      assetsCount: assets.length,
      totalSegments,
      totalThumbnails,
      memoryUsage: this.formatBytes(estimatedMemory),
    };
  }

  private formatBytes(bytes: number): string {
    const sizes = ['B', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 B';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  }
}

// Singleton instance
export const localVideoStorage = new LocalVideoStorage();

// Helper function to generate asset ID
export const generateAssetId = () => `asset_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

export default localVideoStorage;