import AsyncStorage from '@react-native-async-storage/async-storage'
import * as MediaLibrary from 'expo-media-library'
import { createContext, useContext, useEffect, useReducer, useRef, type Dispatch, type ReactNode } from 'react'

const REVIEWED_IDS_KEY = 'reviewed_asset_ids_v2'
const REVIEWED_PERIODS_KEY = 'reviewed_period_counts'

function getPeriodKey(creationTime: number): string {
  const d = new Date(creationTime)
  return `${d.getFullYear()}-${d.getMonth() + 1}`
}

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
  selectedMonth: number | null
  reviewedIds: Set<string>
  reviewedByPeriod: Record<string, number>
  reviewedIdsLoaded: boolean
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
  | { type: 'SET_YEAR'; year: number | null; month?: number | null }
  | { type: 'RESET' }
  | { type: 'LOAD_REVIEWED_IDS'; ids: Set<string>; byPeriod: Record<string, number> }
  | { type: 'CLEAR_REVIEWED_IDS' }
  | { type: 'CLEAR_REVIEWED_FOR_ASSETS'; assetIds: string[]; periodKey?: string }

const initialState: CleanState = {
  assets: [],
  currentIndex: 0,
  markedForDeletion: [],
  actionHistory: [],
  hasNextPage: false,
  endCursor: undefined,
  totalCount: 0,
  selectedYear: null,
  selectedMonth: null,
  reviewedIds: new Set(),
  reviewedByPeriod: {},
  reviewedIdsLoaded: false,
}

function cleanReducer(state: CleanState, action: CleanAction): CleanState {
  switch (action.type) {
    case 'LOAD_REVIEWED_IDS':
      return { ...state, reviewedIds: action.ids, reviewedByPeriod: action.byPeriod, reviewedIdsLoaded: true }

    case 'LOAD_ASSETS': {
      const markedIds = new Set(state.markedForDeletion.map((a) => a.id))
      return {
        ...initialState,
        selectedYear: state.selectedYear,
        selectedMonth: state.selectedMonth,
        markedForDeletion: state.markedForDeletion,
        reviewedIds: state.reviewedIds,
        reviewedByPeriod: state.reviewedByPeriod,
        reviewedIdsLoaded: state.reviewedIdsLoaded,
        assets: action.payload.assets.filter((a) => !markedIds.has(a.id) && !state.reviewedIds.has(a.id)),
        hasNextPage: action.payload.hasNextPage,
        endCursor: action.payload.endCursor,
        totalCount: action.payload.totalCount,
      }
    }

    case 'APPEND_ASSETS': {
      const markedIds = new Set(state.markedForDeletion.map((a) => a.id))
      return {
        ...state,
        assets: [
          ...state.assets,
          ...action.payload.assets.filter((a) => !markedIds.has(a.id) && !state.reviewedIds.has(a.id)),
        ],
        hasNextPage: action.payload.hasNextPage,
        endCursor: action.payload.endCursor,
      }
    }

    case 'SKIP': {
      const current = state.assets[state.currentIndex]
      if (!current) return state
      const newReviewedIds = new Set(state.reviewedIds)
      newReviewedIds.add(current.id)
      const periodKey = getPeriodKey(current.creationTime)
      const newByPeriod = { ...state.reviewedByPeriod, [periodKey]: (state.reviewedByPeriod[periodKey] ?? 0) + 1 }
      return {
        ...state,
        currentIndex: state.currentIndex + 1,
        actionHistory: [...state.actionHistory, { asset: current, action: 'skip' }],
        reviewedIds: newReviewedIds,
        reviewedByPeriod: newByPeriod,
      }
    }

    case 'MARK_DELETE': {
      const current = state.assets[state.currentIndex]
      if (!current) return state
      const newReviewedIds = new Set(state.reviewedIds)
      newReviewedIds.add(current.id)
      const periodKey = getPeriodKey(current.creationTime)
      const newByPeriod = { ...state.reviewedByPeriod, [periodKey]: (state.reviewedByPeriod[periodKey] ?? 0) + 1 }
      return {
        ...state,
        currentIndex: state.currentIndex + 1,
        markedForDeletion: [...state.markedForDeletion, current],
        actionHistory: [...state.actionHistory, { asset: current, action: 'delete' }],
        reviewedIds: newReviewedIds,
        reviewedByPeriod: newByPeriod,
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
      const newReviewedIds = new Set(state.reviewedIds)
      newReviewedIds.delete(lastAction.asset.id)
      const periodKey = getPeriodKey(lastAction.asset.creationTime)
      const newByPeriod = { ...state.reviewedByPeriod }
      if (newByPeriod[periodKey]) {
        newByPeriod[periodKey]--
        if (newByPeriod[periodKey] <= 0) delete newByPeriod[periodKey]
      }
      return {
        ...state,
        currentIndex: state.currentIndex - 1,
        actionHistory: newHistory,
        markedForDeletion: newMarked,
        reviewedIds: newReviewedIds,
        reviewedByPeriod: newByPeriod,
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
        selectedMonth: action.month ?? null,
        markedForDeletion: state.markedForDeletion,
        reviewedIds: state.reviewedIds,
        reviewedByPeriod: state.reviewedByPeriod,
        reviewedIdsLoaded: state.reviewedIdsLoaded,
      }

    case 'RESET':
      return {
        ...initialState,
        selectedYear: state.selectedYear,
        selectedMonth: state.selectedMonth,
        reviewedIds: state.reviewedIds,
        reviewedByPeriod: state.reviewedByPeriod,
        reviewedIdsLoaded: state.reviewedIdsLoaded,
      }

    case 'CLEAR_REVIEWED_IDS':
      return { ...state, reviewedIds: new Set(), reviewedByPeriod: {} }

    case 'CLEAR_REVIEWED_FOR_ASSETS': {
      const newReviewedIds = new Set(state.reviewedIds)
      for (const id of action.assetIds) {
        newReviewedIds.delete(id)
      }
      const newByPeriod = { ...state.reviewedByPeriod }
      if (action.periodKey) {
        delete newByPeriod[action.periodKey]
      }
      return { ...state, reviewedIds: newReviewedIds, reviewedByPeriod: newByPeriod }
    }

    default:
      return state
  }
}

const CleanContext = createContext<CleanState>(initialState)
const CleanDispatchContext = createContext<Dispatch<CleanAction>>(() => {})

export function CleanProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(cleanReducer, initialState)
  const prevReviewedIds = useRef(state.reviewedIds)

  useEffect(() => {
    Promise.all([AsyncStorage.getItem(REVIEWED_IDS_KEY), AsyncStorage.getItem(REVIEWED_PERIODS_KEY)]).then(
      ([idsData, periodsData]) => {
        const ids = idsData ? new Set<string>(JSON.parse(idsData)) : new Set<string>()
        const byPeriod: Record<string, number> = periodsData ? JSON.parse(periodsData) : {}
        dispatch({ type: 'LOAD_REVIEWED_IDS', ids, byPeriod })
      },
    )
  }, [])

  useEffect(() => {
    if (!state.reviewedIdsLoaded || state.reviewedIds === prevReviewedIds.current) return
    prevReviewedIds.current = state.reviewedIds
    AsyncStorage.setItem(REVIEWED_IDS_KEY, JSON.stringify([...state.reviewedIds]))
    AsyncStorage.setItem(REVIEWED_PERIODS_KEY, JSON.stringify(state.reviewedByPeriod))
  }, [state.reviewedIds, state.reviewedIdsLoaded, state.reviewedByPeriod])

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
