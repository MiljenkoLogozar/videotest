'use client';

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Play } from 'lucide-react';
import { VideoPlayerController } from '@/lib/video-player/video-player-controller';
import { useTimeline } from '@/lib/stores/video-editor-store';
import type { LocalVideoAsset } from '@/lib/storage/local-storage';

interface VideoPlayerAJProps {
  asset: LocalVideoAsset | null;
  onTimeUpdate: (time: number) => void;
  onPlayStateChange: (isPlaying: boolean) => void;
  className?: string;
  playerType: 'source' | 'program';
  // Optional external seeking control - only for progress bar clicks
  seekToTime?: number;
}

export const VideoPlayerAJ: React.FC<VideoPlayerAJProps> = ({
  asset,
  onTimeUpdate,
  onPlayStateChange,
  className = '',
  playerType,
  seekToTime
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const controllerRef = useRef<VideoPlayerController | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isVideoReady, setIsVideoReady] = useState(false);
  const [internalIsPlaying, setInternalIsPlaying] = useState(false);
  const [internalCurrentTime, setInternalCurrentTime] = useState(0);
  const [currentFrame, setCurrentFrame] = useState(0);
  const lastSeekTime = useRef<number>(-1);
  
  // Get timeline state to respond to external play/pause
  const timeline = useTimeline();

  // Initialize controller (temporarily disabled canvas rendering)
  useEffect(() => {
    if (canvasRef.current && !controllerRef.current) {
      const controller = new VideoPlayerController();
      
      // Set up callbacks
      controller.onStateChange = (state) => {
        setInternalIsPlaying(state.isPlaying);
        setInternalCurrentTime(state.currentTime);
        setCurrentFrame(state.currentFrame);
        onPlayStateChange(state.isPlaying);
      };
      
      controller.onTimeUpdate = (time) => {
        setInternalCurrentTime(time);
        onTimeUpdate(time);
      };
      
      // Initialize with canvas only (video element managed separately for now)
      controller.initialize(canvasRef.current);
      controllerRef.current = controller;
      
      console.log(`${playerType} player: Controller initialized`);
    }
  }, [playerType, onTimeUpdate, onPlayStateChange]);

  // Load asset into controller
  useEffect(() => {
    const controller = controllerRef.current;
    if (!controller) return;

    if (asset) {
      console.log(`${playerType} player: Loading asset`, asset.fileName);
      setIsLoading(true);
      setError(null);
      setIsVideoReady(false);
      
      try {
        controller.setAsset(asset);
        setIsVideoReady(true);
        setIsLoading(false);
        console.log(`${playerType} player: Asset loaded successfully`);
      } catch (err) {
        console.error(`${playerType} player: Failed to load asset`, err);
        setError(err instanceof Error ? err.message : 'Failed to load video');
        setIsLoading(false);
      }
    } else {
      controller.setAsset(null);
      setIsVideoReady(false);
      setInternalCurrentTime(0);
      setCurrentFrame(0);
    }
  }, [asset, playerType]);

  // Handle external seeking  
  const videoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !isVideoReady || seekToTime === undefined || seekToTime === lastSeekTime.current) {
      return;
    }
    
    console.log(`${playerType} player: External seek to ${seekToTime}s`);
    lastSeekTime.current = seekToTime;
    video.currentTime = seekToTime;
    
    const fps = asset?.metadata.fps || 30;
    setCurrentFrame(Math.floor(seekToTime * fps));
    setInternalCurrentTime(seekToTime);
  }, [seekToTime, isVideoReady, playerType, asset]);

  // Handle video click for play/pause  
  const handleVideoClick = useCallback(() => {
    const video = videoRef.current;
    if (!video || !isVideoReady) {
      console.log(`${playerType} player: Video click ignored - not ready`, { video: !!video, isVideoReady });
      return;
    }

    if (internalIsPlaying) {
      console.log(`${playerType} player: Pausing at frame ${currentFrame} (${internalCurrentTime.toFixed(3)}s)`);
      video.pause();
    } else {
      console.log(`${playerType} player: Playing from frame ${currentFrame} (${internalCurrentTime.toFixed(3)}s)`);
      video.play().catch((error) => {
        console.error(`${playerType} player: Play failed:`, error);
      });
    }
  }, [internalIsPlaying, isVideoReady, playerType, currentFrame, internalCurrentTime]);

  // Listen to timeline play/pause changes
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !isVideoReady) return;

    // Sync with timeline state changes (from external buttons)
    if (timeline.isPlaying && !internalIsPlaying) {
      console.log(`${playerType} player: Timeline play command - starting video`);
      video.play().catch((error) => {
        console.error(`${playerType} player: Timeline play failed:`, error);
      });
    } else if (!timeline.isPlaying && internalIsPlaying) {
      console.log(`${playerType} player: Timeline pause command - pausing video`);
      video.pause();
    }
  }, [timeline.isPlaying, internalIsPlaying, isVideoReady, playerType]);

  // Setup canvas size
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resizeCanvas = () => {
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width;
      canvas.height = rect.height;
    };

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    
    return () => {
      window.removeEventListener('resize', resizeCanvas);
    };
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (controllerRef.current) {
        controllerRef.current.dispose();
        controllerRef.current = null;
      }
    };
  }, []);

  const getPlayerColor = () => {
    return playerType === 'source' ? 'orange' : 'blue';
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className={`relative w-full h-full bg-black ${className}`}>
      {/* HTML Video Element for actual video display */}
      {asset && (
        <video
          ref={videoRef}
          src={asset.fullVideoUrl}
          className="w-full h-full object-contain"
          onClick={handleVideoClick}
          onTimeUpdate={(e) => {
            const video = e.currentTarget;
            if (!video.seeking && isVideoReady) {
              const currentTime = video.currentTime;
              setInternalCurrentTime(currentTime);
              
              const fps = asset.metadata.fps || 30;
              setCurrentFrame(Math.floor(currentTime * fps));
              
              onTimeUpdate(currentTime);
            }
          }}
          onPlay={(e) => {
            console.log(`${playerType} player: Video element play event`);
            setInternalIsPlaying(true);
            onPlayStateChange(true);
          }}
          onPause={(e) => {
            console.log(`${playerType} player: Video element pause event`);
            setInternalIsPlaying(false);
            onPlayStateChange(false);
          }}
          onLoadedMetadata={(e) => {
            const video = e.currentTarget;
            console.log(`${playerType} player: Video metadata loaded`, {
              duration: video.duration,
              readyState: video.readyState,
              networkState: video.networkState
            });
            setIsVideoReady(true);
            setIsLoading(false);
          }}
          onCanPlay={(e) => {
            console.log(`${playerType} player: Video can play`);
          }}
          onCanPlayThrough={(e) => {
            console.log(`${playerType} player: Video can play through`);
          }}
          onLoadStart={(e) => {
            console.log(`${playerType} player: Video load start`);
          }}
          onError={(e) => {
            console.error(`${playerType} player: Video error`, e);
            setError('Failed to load video');
            setIsLoading(false);
          }}
          controls={false}
          playsInline
          preload="metadata"
        />
      )}
      
      {/* Canvas overlay for frame-accurate indicators */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full pointer-events-none"
        style={{ display: process.env.NODE_ENV === 'development' ? 'block' : 'none' }}
      />

      {/* Loading State */}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50">
          <div className="flex flex-col items-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white"></div>
            <p className="text-white mt-4 text-sm">Loading video...</p>
          </div>
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-80">
          <div className="text-center">
            <div className="w-16 h-16 mx-auto mb-4 text-red-500">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 15.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
            <p className="text-white text-sm mb-2">Video Error</p>
            <p className="text-gray-400 text-xs">{error}</p>
          </div>
        </div>
      )}

      {/* No Video State */}
      {!asset && !isLoading && !error && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center">
            <div className={`w-16 h-16 mx-auto mb-4 text-${getPlayerColor()}-500`}>
              <Play className="w-full h-full" />
            </div>
            <p className="text-white text-sm mb-1">
              {playerType === 'source' ? 'Source Player' : 'Program Player'}
            </p>
            <p className="text-gray-400 text-xs">
              {playerType === 'source' ? 'Select a video to preview' : 'Timeline output will appear here'}
            </p>
          </div>
        </div>
      )}

      {/* Debug Info (only in development) */}
      {process.env.NODE_ENV === 'development' && isVideoReady && (
        <div className="absolute top-2 left-2 text-xs text-white bg-black bg-opacity-50 p-2 rounded">
          <div>Frame: {currentFrame}</div>
          <div>Time: {formatTime(internalCurrentTime)}</div>
          <div>Playing: {internalIsPlaying ? 'Yes' : 'No'}</div>
          <div>FPS: {asset?.metadata.fps || 0}</div>
        </div>
      )}
    </div>
  );
};

export default VideoPlayerAJ;