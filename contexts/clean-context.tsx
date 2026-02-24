import * as MediaLibrary from 'expo-media-library'
import { createContext, useContext, useReducer, type Dispatch, type ReactNode } from 'react'

type ActionRecord = {
  asset: MediaLibrary.Asset
  action: 'skip' | 'delete'
}

type CleanState = {
  assets: MediaLibrary.Asset[]
  currentIndex: number
  markedForDeletion: MediaLibrary.Asset[]
  actionHistory: ActionRecord[]
  hasNextPage: boolean
  endCursor: string | undefined
  totalCount: number
  selectedYear: number | null
}

type CleanAction =
  | {
      type: 'LOAD_ASSETS'
      payload: { assets: MediaLibrary.Asset[]; hasNextPage: boolean; endCursor: string | undefined; totalCount: number }
    }
  | {
      type: 'APPEND_ASSETS'
      payload: { assets: MediaLibrary.Asset[]; hasNextPage: boolean; endCursor: string | undefined }
    }
  | { type: 'SKIP' }
  | { type: 'MARK_DELETE' }
  | { type: 'UNDO' }
  | { type: 'REMOVE_FROM_DELETION'; assetId: string }
  | { type: 'SET_YEAR'; year: number | null }
  | { type: 'RESET' }

const initialState: CleanState = {
  assets: [],
  currentIndex: 0,
  markedForDeletion: [],
  actionHistory: [],
  hasNextPage: false,
  endCursor: undefined,
  totalCount: 0,
  selectedYear: null,
}

function cleanReducer(state: CleanState, action: CleanAction): CleanState {
  switch (action.type) {
    case 'LOAD_ASSETS': {
      const markedIds = new Set(state.markedForDeletion.map((a) => a.id))
      return {
        ...initialState,
        selectedYear: state.selectedYear,
        markedForDeletion: state.markedForDeletion,
        assets: action.payload.assets.filter((a) => !markedIds.has(a.id)),
        hasNextPage: action.payload.hasNextPage,
        endCursor: action.payload.endCursor,
        totalCount: action.payload.totalCount,
      }
    }

    case 'APPEND_ASSETS': {
      const markedIds = new Set(state.markedForDeletion.map((a) => a.id))
      return {
        ...state,
        assets: [...state.assets, ...action.payload.assets.filter((a) => !markedIds.has(a.id))],
        hasNextPage: action.payload.hasNextPage,
        endCursor: action.payload.endCursor,
      }
    }

    case 'SKIP': {
      const current = state.assets[state.currentIndex]
      if (!current) return state
      return {
        ...state,
        currentIndex: state.currentIndex + 1,
        actionHistory: [...state.actionHistory, { asset: current, action: 'skip' }],
      }
    }

    case 'MARK_DELETE': {
      const current = state.assets[state.currentIndex]
      if (!current) return state
      return {
        ...state,
        currentIndex: state.currentIndex + 1,
        markedForDeletion: [...state.markedForDeletion, current],
        actionHistory: [...state.actionHistory, { asset: current, action: 'delete' }],
      }
    }

    case 'UNDO': {
      if (state.actionHistory.length === 0) return state
      const lastAction = state.actionHistory[state.actionHistory.length - 1]
      const newHistory = state.actionHistory.slice(0, -1)
      const newMarked =
        lastAction.action === 'delete'
          ? state.markedForDeletion.filter((a) => a.id !== lastAction.asset.id)
          : state.markedForDeletion
      return {
        ...state,
        currentIndex: state.currentIndex - 1,
        actionHistory: newHistory,
        markedForDeletion: newMarked,
      }
    }

    case 'REMOVE_FROM_DELETION':
      return {
        ...state,
        markedForDeletion: state.markedForDeletion.filter((a) => a.id !== action.assetId),
      }

    case 'SET_YEAR':
      return {
        ...initialState,
        selectedYear: action.year,
        markedForDeletion: state.markedForDeletion,
      }

    case 'RESET':
      return initialState

    default:
      return state
  }
}

const CleanContext = createContext<CleanState>(initialState)
const CleanDispatchContext = createContext<Dispatch<CleanAction>>(() => {})

export function CleanProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(cleanReducer, initialState)
  return (
    <CleanContext.Provider value={state}>
      <CleanDispatchContext.Provider value={dispatch}>{children}</CleanDispatchContext.Provider>
    </CleanContext.Provider>
  )
}

export function useCleanState() {
  return useContext(CleanContext)
}

export function useCleanDispatch() {
  return useContext(CleanDispatchContext)
}
