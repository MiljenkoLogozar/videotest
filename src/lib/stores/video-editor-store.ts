import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { TrackType, ItemType } from '@/types';
import type { 
  Project, 
  Track, 
  TrackItem, 
  TimelineState, 
  VideoEditorStore
} from '@/types';

// Helper function to generate IDs
const generateId = () => Math.random().toString(36).substr(2, 9);

// Initial timeline state
const initialTimelineState: TimelineState = {
  currentTime: 0,
  zoom: 100, // pixels per second
  offset: 0,
  selectedItems: [],
  isPlaying: false,
  duration: 0,
};


// Create the global store instance for backwards compatibility
export const useVideoEditorStore = create<VideoEditorStore>()(
  immer((set, get) => ({
    // State
    currentProject: null,
    projects: [],
    timeline: initialTimelineState,
    isLoading: false,
    error: null,

    // Project actions
    createProject: (title: string) => {
      set((state) => {
        const newProject: Project = {
          id: generateId(),
          title,
          duration: 0,
          fps: 30,
          resolution: { width: 1920, height: 1080 },
          tracks: [
            // Create default tracks: 4 video + 8 audio
            ...Array.from({ length: 4 }, (_, i) => ({
              id: generateId(),
              projectId: '',
              type: 'video' as TrackType,
              index: i,
              items: [],
            })),
            ...Array.from({ length: 8 }, (_, i) => ({
              id: generateId(),
              projectId: '',
              type: 'audio' as TrackType,
              index: i + 4,
              items: [],
            })),
          ],
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        // Set project ID in tracks
        newProject.tracks.forEach(track => {
          track.projectId = newProject.id;
        });

        state.currentProject = newProject;
        state.projects.push(newProject);
        state.timeline = { ...initialTimelineState };
      });
    },

    loadProject: async (id: string) => {
      set((state) => {
        state.isLoading = true;
        state.error = null;
      });

      try {
        // In a real app, this would be an API call
        const project = get().projects.find(p => p.id === id);
        
        if (!project) {
          throw new Error('Project not found');
        }

        set((state) => {
          state.currentProject = project;
          state.timeline = {
            ...initialTimelineState,
            duration: project.duration,
          };
          state.isLoading = false;
        });
      } catch (error) {
        set((state) => {
          state.error = error instanceof Error ? error.message : 'Failed to load project';
          state.isLoading = false;
        });
      }
    },

    updateProject: (updates: Partial<Project>) => {
      set((state) => {
        if (state.currentProject) {
          Object.assign(state.currentProject, updates, { updatedAt: new Date() });
          
          // Update in projects array
          const projectIndex = state.projects.findIndex(p => p.id === state.currentProject!.id);
          if (projectIndex !== -1) {
            Object.assign(state.projects[projectIndex], updates, { updatedAt: new Date() });
          }
        }
      });
    },

    // Track item actions
    addTrackItem: (trackId: string, item: Omit<TrackItem, 'id'>) => {
      set((state) => {
        if (!state.currentProject) return;

        const track = state.currentProject.tracks.find(t => t.id === trackId);
        if (!track) return;

        const newItem: TrackItem = {
          ...item,
          id: generateId(),
          trackId,
        };

        track.items.push(newItem);

        // Update project duration if necessary
        const itemEndTime = newItem.startTime + newItem.duration;
        if (itemEndTime > state.currentProject.duration) {
          state.currentProject.duration = itemEndTime;
          state.timeline.duration = itemEndTime;
        }

        state.currentProject.updatedAt = new Date();
      });
    },

    updateTrackItem: (itemId: string, updates: Partial<TrackItem>) => {
      set((state) => {
        if (!state.currentProject) return;

        // Find the item across all tracks
        for (const track of state.currentProject.tracks) {
          const item = track.items.find(i => i.id === itemId);
          if (item) {
            Object.assign(item, updates);
            
            // Update project duration if necessary
            const itemEndTime = item.startTime + item.duration;
            if (itemEndTime > state.currentProject.duration) {
              state.currentProject.duration = itemEndTime;
              state.timeline.duration = itemEndTime;
            }
            
            state.currentProject.updatedAt = new Date();
            break;
          }
        }
      });
    },

    deleteTrackItem: (itemId: string) => {
      set((state) => {
        if (!state.currentProject) return;

        // Find and remove the item
        for (const track of state.currentProject.tracks) {
          const itemIndex = track.items.findIndex(i => i.id === itemId);
          if (itemIndex !== -1) {
            track.items.splice(itemIndex, 1);
            
            // Remove from selection if selected
            const selectionIndex = state.timeline.selectedItems.indexOf(itemId);
            if (selectionIndex !== -1) {
              state.timeline.selectedItems.splice(selectionIndex, 1);
            }
            
            state.currentProject.updatedAt = new Date();
            break;
          }
        }

        // Recalculate project duration
        let maxDuration = 0;
        for (const track of state.currentProject.tracks) {
          for (const item of track.items) {
            const itemEndTime = item.startTime + item.duration;
            if (itemEndTime > maxDuration) {
              maxDuration = itemEndTime;
            }
          }
        }
        state.currentProject.duration = maxDuration;
        state.timeline.duration = maxDuration;
      });
    },

    // Timeline actions
    setCurrentTime: (time: number) => {
      set((state) => {
        state.timeline.currentTime = Math.max(0, Math.min(time, state.timeline.duration));
      });
    },

    play: () => {
      set((state) => {
        state.timeline.isPlaying = true;
      });
    },

    pause: () => {
      set((state) => {
        state.timeline.isPlaying = false;
      });
    },

    seek: (time: number) => {
      set((state) => {
        state.timeline.currentTime = Math.max(0, Math.min(time, state.timeline.duration));
        state.timeline.isPlaying = false;
      });
    },

    // Seek without automatically pausing (for scrubbing while playing)
    setCurrentTimeOnly: (time: number) => {
      set((state) => {
        state.timeline.currentTime = Math.max(0, Math.min(time, state.timeline.duration));
      });
    },

    setZoom: (zoom: number) => {
      set((state) => {
        // Clamp zoom between reasonable values (10 pixels/second to 1000 pixels/second)
        state.timeline.zoom = Math.max(10, Math.min(1000, zoom));
      });
    },

    setOffset: (offset: number) => {
      set((state) => {
        state.timeline.offset = offset;
      });
    },

    selectItems: (itemIds: string[]) => {
      set((state) => {
        state.timeline.selectedItems = [...itemIds];
      });
    },
  }))
);

// Selector hooks for optimized re-renders
export const useCurrentProject = () => useVideoEditorStore(state => state.currentProject);
export const useTimeline = () => useVideoEditorStore(state => state.timeline);
export const useIsLoading = () => useVideoEditorStore(state => state.isLoading);
export const useError = () => useVideoEditorStore(state => state.error);

// Action hooks
export const useProjectActions = () => {
  const createProject = useVideoEditorStore(state => state.createProject);
  const loadProject = useVideoEditorStore(state => state.loadProject);
  const updateProject = useVideoEditorStore(state => state.updateProject);
  
  return { createProject, loadProject, updateProject };
};

export const useTrackItemActions = () => {
  const addTrackItem = useVideoEditorStore(state => state.addTrackItem);
  const updateTrackItem = useVideoEditorStore(state => state.updateTrackItem);
  const deleteTrackItem = useVideoEditorStore(state => state.deleteTrackItem);
  
  return { addTrackItem, updateTrackItem, deleteTrackItem };
};

export const useTimelineActions = () => {
  const setCurrentTime = useVideoEditorStore(state => state.setCurrentTime);
  const play = useVideoEditorStore(state => state.play);
  const pause = useVideoEditorStore(state => state.pause);
  const seek = useVideoEditorStore(state => state.seek);
  const setZoom = useVideoEditorStore(state => state.setZoom);
  const setOffset = useVideoEditorStore(state => state.setOffset);
  const selectItems = useVideoEditorStore(state => state.selectItems);
  
  return { setCurrentTime, play, pause, seek, setZoom, setOffset, selectItems };
};

// Computed selectors
export const useSelectedTrackItems = () => {
  return useVideoEditorStore(state => {
    if (!state.currentProject) return [];
    
    const selectedItems: TrackItem[] = [];
    for (const track of state.currentProject.tracks) {
      for (const item of track.items) {
        if (state.timeline.selectedItems.includes(item.id)) {
          selectedItems.push(item);
        }
      }
    }
    return selectedItems;
  });
};

export const useTracksByType = (type: TrackType) => {
  return useVideoEditorStore(state => {
    if (!state.currentProject) return [];
    return state.currentProject.tracks.filter(track => track.type === type);
  });
};

export const useProjectDuration = () => {
  return useVideoEditorStore(state => state.currentProject?.duration || 0);
};

export default useVideoEditorStore;