/**
 * Video Player Controller inspired by Al Jazeera's architecture
 * Manages frame ticker, renderer, and provides unified control
 */

import { FrameTicker } from './frame-ticker';
import { VideoRenderer } from './video-renderer';
import type { LocalVideoAsset } from '@/lib/storage/local-storage';

export interface VideoPlayerState {
  isPlaying: boolean;
  currentFrame: number;
  currentTime: number;
  duration: number;
  fps: number;
}

export class VideoPlayerController {
  private frameTicker: FrameTicker | null = null;
  private renderer: VideoRenderer | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private animationFrameId: number | null = null;
  private asset: LocalVideoAsset | null = null;
  
  // Callbacks
  public onStateChange?: (state: VideoPlayerState) => void;
  public onTimeUpdate?: (time: number) => void;

  constructor() {
    this.render = this.render.bind(this);
  }

  initialize(canvas: HTMLCanvasElement): void {
    this.canvas = canvas;
    this.renderer = new VideoRenderer(canvas);
    this.startRenderLoop();
  }

  setAsset(asset: LocalVideoAsset | null): void {
    this.asset = asset;
    
    if (asset) {
      // Initialize frame ticker with asset's FPS
      if (this.frameTicker) {
        this.frameTicker.dispose();
      }
      
      this.frameTicker = new FrameTicker(asset.metadata.fps);
      this.frameTicker.boundary = {
        start: 0,
        end: Math.floor(asset.metadata.duration * asset.metadata.fps)
      };
      
      // Configure renderer
      if (this.renderer) {
        this.renderer.setAsset(asset);
        this.renderer.setSrc(asset.fullVideoUrl);
      }
      
      this.notifyStateChange();
    } else {
      if (this.frameTicker) {
        this.frameTicker.dispose();
        this.frameTicker = null;
      }
      
      if (this.renderer) {
        this.renderer.setAsset(null);
        this.renderer.setSrc(null);
        this.renderer.reset();
      }
    }
  }

  play(): void {
    if (this.frameTicker) {
      this.frameTicker.start();
      this.notifyStateChange();
    }
  }

  pause(): void {
    if (this.frameTicker) {
      this.frameTicker.stop();
      this.notifyStateChange();
    }
  }

  seekToFrame(frameNumber: number): void {
    if (this.frameTicker) {
      this.frameTicker.currentFrame = frameNumber;
      this.notifyStateChange();
      this.notifyTimeUpdate();
    }
  }

  seekToTime(time: number): void {
    if (this.frameTicker && this.asset) {
      const frame = Math.floor(time * this.asset.metadata.fps);
      this.seekToFrame(frame);
    }
  }

  getCurrentState(): VideoPlayerState | null {
    if (!this.frameTicker || !this.asset) {
      return null;
    }

    const tick = this.frameTicker.currentTick;
    return {
      isPlaying: this.frameTicker.isPlaying,
      currentFrame: tick.frame,
      currentTime: tick.time,
      duration: this.asset.metadata.duration,
      fps: this.asset.metadata.fps
    };
  }

  private startRenderLoop(): void {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }
    this.render();
  }

  private render(): void {
    if (this.frameTicker && this.renderer) {
      // Update frame ticker
      this.frameTicker.update();
      
      // Get current tick
      const tick = this.frameTicker.currentTick;
      
      // Render frame
      this.renderer.render(tick);
      
      // Notify of time updates during playback
      if (this.frameTicker.isPlaying) {
        this.notifyTimeUpdate();
      }
    }

    // Continue render loop
    this.animationFrameId = requestAnimationFrame(this.render);
  }

  private notifyStateChange(): void {
    const state = this.getCurrentState();
    if (state && this.onStateChange) {
      this.onStateChange(state);
    }
  }

  private notifyTimeUpdate(): void {
    const state = this.getCurrentState();
    if (state && this.onTimeUpdate) {
      this.onTimeUpdate(state.currentTime);
    }
  }

  dispose(): void {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    
    if (this.frameTicker) {
      this.frameTicker.dispose();
      this.frameTicker = null;
    }
    
    if (this.renderer) {
      this.renderer.reset();
      this.renderer = null;
    }
  }
}