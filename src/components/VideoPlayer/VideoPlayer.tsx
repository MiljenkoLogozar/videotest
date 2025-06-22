'use client';

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Play } from 'lucide-react';
import type { LocalVideoAsset } from '@/lib/storage/local-storage';

interface VideoPlayerProps {
  asset: LocalVideoAsset | null;
  onTimeUpdate: (time: number) => void;
  onPlayStateChange: (isPlaying: boolean) => void;
  className?: string;
  playerType: 'source' | 'program';
  // Optional external seeking control - only for progress bar clicks
  seekToTime?: number;
}

// Helper function to create HLS playlist from local segments
const createHLSPlaylist = (asset: LocalVideoAsset): string => {
  const segmentDuration = asset.metadata.duration / asset.segmentUrls.length;
  
  let playlist = '#EXTM3U\n';
  playlist += '#EXT-X-VERSION:3\n';
  playlist += `#EXT-X-TARGETDURATION:${Math.ceil(segmentDuration)}\n`;
  playlist += '#EXT-X-MEDIA-SEQUENCE:0\n';
  
  asset.segmentUrls.forEach((segmentUrl) => {
    playlist += `#EXTINF:${segmentDuration.toFixed(6)},\n`;
    playlist += `${segmentUrl}\n`;
  });
  
  playlist += '#EXT-X-ENDLIST\n';
  return playlist;
};

export const VideoPlayer: React.FC<VideoPlayerProps> = ({
  asset,
  onTimeUpdate,
  onPlayStateChange,
  className = '',
  playerType,
  seekToTime
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [volume] = useState(1);
  const [isMuted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, setDuration] = useState(0);
  const [isVideoReady, setIsVideoReady] = useState(false);
  const [currentPlaylistUrl, setCurrentPlaylistUrl] = useState<string | null>(null);
  
  // Internal autonomous state - no external control
  const [internalIsPlaying, setInternalIsPlaying] = useState(false);
  const [internalCurrentTime, setInternalCurrentTime] = useState(0);
  const [currentFrame, setCurrentFrame] = useState(0);
  const animationFrameRef = useRef<number | null>(null);
  const lastSeekTime = useRef<number>(-1);

  // Load video asset into player
  const loadVideo = useCallback(async (videoAsset: LocalVideoAsset) => {
    if (!videoRef.current) return;

    try {
      setIsLoading(true);
      setError(null);
      setIsVideoReady(false);

      const video = videoRef.current;
      
      if (videoAsset.segmentUrls.length > 0) {
        console.log(`Loading video in ${playerType} player:`, videoAsset.fileName);
        
        // Clean up previous playlist URL
        if (currentPlaylistUrl) {
          URL.revokeObjectURL(currentPlaylistUrl);
        }
        
        // Create a proper M3U8 playlist for all segments
        const playlist = createHLSPlaylist(videoAsset);
        const playlistBlob = new Blob([playlist], { type: 'application/vnd.apple.mpegurl' });
        const playlistUrl = URL.createObjectURL(playlistBlob);
        setCurrentPlaylistUrl(playlistUrl);
        
        // Check if HLS is natively supported
        if (video.canPlayType('application/vnd.apple.mpegurl')) {
          console.log(`${playerType} player: Using HLS playlist with ${videoAsset.segmentUrls.length} segments`);
          video.src = playlistUrl;
        } else {
          // Fallback to full video for browsers without native HLS support
          console.warn(`${playerType} player: Native HLS not supported, using full video`);
          
          // Clean up playlist URL since we're not using it
          URL.revokeObjectURL(playlistUrl);
          setCurrentPlaylistUrl(null);
          
          // Use full video instead of just first segment
          if (videoAsset.fullVideoUrl) {
            console.log(`${playerType} player: Loading full video:`, videoAsset.fullVideoUrl);
            console.log(`${playerType} player: Full video URL type:`, typeof videoAsset.fullVideoUrl);
            console.log(`${playerType} player: Full video URL starts with blob:`, videoAsset.fullVideoUrl.startsWith('blob:'));
            
            video.src = videoAsset.fullVideoUrl;
          } else {
            throw new Error('Full video not available');
          }
        }
        
        // Add timeout for loading (declare before event handlers)
        const loadTimeout = setTimeout(() => {
          console.warn(`${playerType} player: Loading timeout after 10 seconds`);
          setError('Video loading timeout - please try again');
          setIsLoading(false);
        }, 10000);
        
        // Set up event listeners
        const handleLoadedMetadata = () => {
          setDuration(video.duration || videoAsset.metadata.duration);
          setIsVideoReady(true);
          setIsLoading(false);
          clearTimeout(loadTimeout); // Clear timeout on successful load
          console.log(`${playerType} player loaded:`, video.duration, 'seconds');
        };

        const handleError = (e: Event) => {
          console.error(`${playerType} player error:`, e);
          const target = e.target as HTMLVideoElement;
          const errorCode = target.error?.code;
          const errorMessage = target.error?.message || 'Unknown video error';
          
          console.error(`${playerType} player error details:`, {
            code: errorCode,
            message: errorMessage,
            src: target.src
          });
          
          setError(`Failed to load video: ${errorMessage}`);
          setIsLoading(false);
          clearTimeout(loadTimeout); // Clear timeout on error
        };

        const handleTimeUpdate = () => {
          // Update internal time and notify parent
          if (!video.seeking && isVideoReady) {
            const currentTime = video.currentTime;
            setInternalCurrentTime(currentTime);
            
            // Calculate current frame for frame-accurate control
            const fps = videoAsset.metadata.fps || 30;
            setCurrentFrame(Math.floor(currentTime * fps));
            
            // Notify parent of time change
            onTimeUpdate(currentTime);
          }
        };

        const handleCanPlay = () => {
          console.log(`${playerType} player: Video can start playing`);
          setIsLoading(false);
          clearTimeout(loadTimeout); // Clear timeout when video can play
        };

        const handleLoadStart = () => {
          console.log(`${playerType} player: Started loading video`);
        };

        const handleProgress = () => {
          console.log(`${playerType} player: Loading progress`);
        };

        video.addEventListener('loadedmetadata', handleLoadedMetadata);
        video.addEventListener('error', handleError);
        video.addEventListener('timeupdate', handleTimeUpdate);
        video.addEventListener('canplay', handleCanPlay);
        video.addEventListener('loadstart', handleLoadStart);
        video.addEventListener('progress', handleProgress);

        // Load the video
        video.load();

        // Cleanup function
        return () => {
          clearTimeout(loadTimeout);
          video.removeEventListener('loadedmetadata', handleLoadedMetadata);
          video.removeEventListener('error', handleError);
          video.removeEventListener('timeupdate', handleTimeUpdate);
          video.removeEventListener('canplay', handleCanPlay);
          video.removeEventListener('loadstart', handleLoadStart);
          video.removeEventListener('progress', handleProgress);
          
          // Clean up playlist URL
          if (currentPlaylistUrl) {
            URL.revokeObjectURL(currentPlaylistUrl);
            setCurrentPlaylistUrl(null);
          }
        };
      } else {
        throw new Error('No video segments available');
      }
    } catch (err) {
      console.error(`Failed to load video in ${playerType} player:`, err);
      setError(err instanceof Error ? err.message : 'Failed to load video');
      setIsLoading(false);
    }
  }, [playerType, onTimeUpdate, currentPlaylistUrl, isVideoReady]);

  // Load video when asset changes
  useEffect(() => {
    if (asset) {
      loadVideo(asset);
    } else {
      // Clear video when no asset
      if (videoRef.current) {
        videoRef.current.src = '';
        setIsVideoReady(false);
        setDuration(0);
      }
      
      // Clean up playlist URL
      if (currentPlaylistUrl) {
        URL.revokeObjectURL(currentPlaylistUrl);
        setCurrentPlaylistUrl(null);
      }
    }
  }, [asset, loadVideo, currentPlaylistUrl]);

  // Handle external seeking only (from progress bar clicks)
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !isVideoReady || seekToTime === undefined || seekToTime === lastSeekTime.current) {
      return;
    }
    
    console.log(`${playerType} player: External seek to ${seekToTime}s`);
    lastSeekTime.current = seekToTime;
    video.currentTime = seekToTime;
    setInternalCurrentTime(seekToTime);
    
    const fps = asset?.metadata.fps || 30;
    setCurrentFrame(Math.floor(seekToTime * fps));
  }, [seekToTime, isVideoReady, playerType, asset]);

  // Animation frame loop for smooth time updates
  const updateTimeLoop = useCallback(() => {
    const video = videoRef.current;
    if (video && !video.paused && !video.seeking && isVideoReady) {
      const currentTime = video.currentTime;
      setInternalCurrentTime(currentTime);
      
      const fps = asset?.metadata.fps || 30;
      setCurrentFrame(Math.floor(currentTime * fps));
      
      onTimeUpdate(currentTime);
    }
    
    if (internalIsPlaying) {
      animationFrameRef.current = requestAnimationFrame(updateTimeLoop);
    }
  }, [internalIsPlaying, isVideoReady, asset, onTimeUpdate]);

  // Start/stop animation frame loop based on playing state
  useEffect(() => {
    if (internalIsPlaying && isVideoReady) {
      animationFrameRef.current = requestAnimationFrame(updateTimeLoop);
    } else if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [internalIsPlaying, isVideoReady, updateTimeLoop]);

  // Handle volume changes
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    video.volume = isMuted ? 0 : volume;
  }, [volume, isMuted]);

  const handleVideoClick = () => {
    const video = videoRef.current;
    if (!video || !isVideoReady) return;

    // Autonomous play/pause control - maintain internal state
    if (internalIsPlaying) {
      console.log(`${playerType} player: Pausing at frame ${currentFrame} (${internalCurrentTime.toFixed(3)}s)`);
      video.pause();
      setInternalIsPlaying(false);
      onPlayStateChange(false);
    } else {
      console.log(`${playerType} player: Playing from frame ${currentFrame} (${internalCurrentTime.toFixed(3)}s)`);
      video.play().catch(console.error);
      setInternalIsPlaying(true);
      onPlayStateChange(true);
    }
  };

  // Note: Public methods removed for now to avoid unused variable errors
  // Can be re-added when needed for external programmatic control

  const getPlayerColor = () => {
    return playerType === 'source' ? 'orange' : 'blue';
  };

  // Note: Public methods available but not exposed via ref for now
  // Can be added later if needed for external control

  return (
    <div className={`relative w-full h-full bg-black ${className}`}>
      {/* Video Element */}
      <video
        ref={videoRef}
        className="w-full h-full object-contain cursor-pointer"
        onClick={handleVideoClick}
        playsInline
        muted={isMuted}
        preload="metadata"
        controls={false}
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

    </div>
  );
};

export default VideoPlayer;