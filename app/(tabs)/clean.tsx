import { Ionicons } from '@expo/vector-icons'
import * as Haptics from 'expo-haptics'
import { Image } from 'expo-image'
import { LivePhotoView } from 'expo-live-photo'
import * as MediaLibrary from 'expo-media-library'
import { useRouter } from 'expo-router'
import { useVideoPlayer, VideoView } from 'expo-video'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Dimensions, FlatList, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, { interpolate, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated'
import { scheduleOnRN } from 'react-native-worklets'

import { useCleanDispatch, useCleanState } from '@/contexts/clean-context'

const { width: SCREEN_WIDTH } = Dimensions.get('window')
const SWIPE_LEFT_THRESHOLD = SCREEN_WIDTH * 0.15
const SWIPE_RIGHT_THRESHOLD = SCREEN_WIDTH * 0.35

const PAGE_SIZE = 20
const PRELOAD_THRESHOLD = 5

export default function CleanScreen() {
  const state = useCleanState()
  const dispatch = useCleanDispatch()
  const router = useRouter()
  const [permissionStatus, setPermissionStatus] = useState<MediaLibrary.PermissionStatus | null>(null)
  const [yearPickerVisible, setYearPickerVisible] = useState(false)
  const [yearOptions, setYearOptions] = useState<(number | null)[]>([null])
  const [isLoaded, setIsLoaded] = useState(false)

  const [livePhotoSource, setLivePhotoSource] = useState<{
    assetId: string
    photoUri: string
    pairedVideoUri: string
  } | null>(null)
  const isLivePhotoAvailable = useRef(Platform.OS === 'ios' && LivePhotoView.isAvailable()).current

  const translateX = useSharedValue(0)
  const translateY = useSharedValue(0)
  const cardOpacity = useSharedValue(1)

  const getDateRange = useCallback(
    (year: number | null): Pick<MediaLibrary.AssetsOptions, 'createdAfter' | 'createdBefore'> => {
      if (year === null) return {}
      return {
        createdAfter: new Date(year, 0, 1),
        createdBefore: new Date(year + 1, 0, 1),
      }
    },
    [],
  )

  // Build year options from earliest photo, only include years with photos
  const loadYearOptions = useCallback(async () => {
    const oldest = await MediaLibrary.getAssetsAsync({
      first: 1,
      sortBy: [[MediaLibrary.SortBy.creationTime, true]],
      mediaType: [MediaLibrary.MediaType.photo, MediaLibrary.MediaType.video],
    })
    const currentYear = new Date().getFullYear()
    let startYear = currentYear - 5
    if (oldest.assets.length > 0) {
      startYear = new Date(oldest.assets[0].creationTime).getFullYear()
    }
    const years: (number | null)[] = [null]
    for (let y = currentYear; y >= startYear; y--) {
      const result = await MediaLibrary.getAssetsAsync({
        first: 1,
        mediaType: [MediaLibrary.MediaType.photo, MediaLibrary.MediaType.video],
        createdAfter: new Date(y, 0, 1),
        createdBefore: new Date(y + 1, 0, 1),
      })
      if (result.totalCount > 0) {
        years.push(y)
      }
    }
    setYearOptions(years)
  }, [])

  const loadInitialAssets = useCallback(async () => {
    setIsLoaded(false)
    const dateRange = getDateRange(state.selectedYear)
    const result = await MediaLibrary.getAssetsAsync({
      first: PAGE_SIZE,
      sortBy: [MediaLibrary.SortBy.creationTime],
      mediaType: [MediaLibrary.MediaType.photo, MediaLibrary.MediaType.video],
      ...dateRange,
    })
    dispatch({
      type: 'LOAD_ASSETS',
      payload: {
        assets: result.assets,
        hasNextPage: result.hasNextPage,
        endCursor: result.endCursor,
        totalCount: result.totalCount,
      },
    })
    setIsLoaded(true)
  }, [dispatch, getDateRange, state.selectedYear])

  // Request permission & load year options
  useEffect(() => {
    ;(async () => {
      const { status } = await MediaLibrary.requestPermissionsAsync()
      setPermissionStatus(status)
      if (status === MediaLibrary.PermissionStatus.GRANTED) {
        await loadYearOptions()
        loadInitialAssets()
      }
    })()
  }, [loadInitialAssets, loadYearOptions])

  const loadMoreAssets = useCallback(async () => {
    if (!state.hasNextPage || !state.endCursor) return
    const dateRange = getDateRange(state.selectedYear)
    const result = await MediaLibrary.getAssetsAsync({
      first: PAGE_SIZE,
      after: state.endCursor,
      sortBy: [MediaLibrary.SortBy.creationTime],
      mediaType: [MediaLibrary.MediaType.photo, MediaLibrary.MediaType.video],
      ...dateRange,
    })
    dispatch({
      type: 'APPEND_ASSETS',
      payload: {
        assets: result.assets,
        hasNextPage: result.hasNextPage,
        endCursor: result.endCursor,
      },
    })
  }, [state.hasNextPage, state.endCursor, dispatch, getDateRange, state.selectedYear])

  // Reload when year changes
  useEffect(() => {
    if (permissionStatus === MediaLibrary.PermissionStatus.GRANTED) {
      loadInitialAssets()
    }
  }, [state.selectedYear, permissionStatus, loadInitialAssets])

  // Preload more when approaching the end
  useEffect(() => {
    if (state.assets.length - state.currentIndex <= PRELOAD_THRESHOLD && state.hasNextPage) {
      loadMoreAssets()
    }
  }, [state.currentIndex, state.assets.length, state.hasNextPage, loadMoreAssets])

  const currentAsset = state.assets[state.currentIndex]
  const nextAsset = state.assets[state.currentIndex + 1]
  const isFinished = state.currentIndex >= state.assets.length && state.assets.length > 0
  const isVideo = currentAsset?.mediaType === 'video'

  // Video player for current asset
  const videoSource = useMemo(() => (isVideo && currentAsset ? currentAsset.uri : null), [isVideo, currentAsset])
  const videoPlayer = useVideoPlayer(videoSource, (player) => {
    player.loop = true
    player.play()
  })

  // Fetch Live Photo paired video URI for current asset
  useEffect(() => {
    if (!isLivePhotoAvailable || !currentAsset) {
      setLivePhotoSource(null)
      return
    }
    const isLivePhoto = currentAsset.mediaSubtypes?.includes('livePhoto')
    if (!isLivePhoto) {
      setLivePhotoSource(null)
      return
    }
    let cancelled = false
    ;(async () => {
      const info = await MediaLibrary.getAssetInfoAsync(currentAsset.id)
      if (cancelled) return
      if (info.pairedVideoAsset?.uri) {
        setLivePhotoSource({
          assetId: currentAsset.id,
          photoUri: info.localUri ?? info.uri,
          pairedVideoUri: info.pairedVideoAsset.uri,
        })
      } else {
        setLivePhotoSource(null)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [currentAsset, isLivePhotoAvailable])

  const handleSelectYear = useCallback(
    (year: number | null) => {
      if (year === state.selectedYear) return
      dispatch({ type: 'SET_YEAR', year })
    },
    [dispatch, state.selectedYear],
  )

  const hapticFeedback = useCallback(() => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    }
  }, [])

  const handleSkip = useCallback(() => {
    hapticFeedback()
    dispatch({ type: 'SKIP' })
  }, [dispatch, hapticFeedback])

  const handleMarkDelete = useCallback(() => {
    hapticFeedback()
    dispatch({ type: 'MARK_DELETE' })
  }, [dispatch, hapticFeedback])

  // Reset position after React re-renders with new asset
  useLayoutEffect(() => {
    translateX.value = 0
    translateY.value = 0
    cardOpacity.value = 1
  }, [state.currentIndex, translateX, translateY, cardOpacity])

  const handleUndo = useCallback(() => {
    hapticFeedback()
    dispatch({ type: 'UNDO' })
  }, [dispatch, hapticFeedback])

  const resetPosition = useCallback(() => {
    translateX.value = withTiming(0, { duration: 200 })
    translateY.value = withTiming(0, { duration: 200 })
  }, [translateX, translateY])

  const animateSwipe = useCallback(
    (direction: 'left' | 'right') => {
      const target = direction === 'left' ? -SCREEN_WIDTH * 1.5 : SCREEN_WIDTH * 1.5
      translateX.value = withTiming(target, { duration: 300 }, () => {
        cardOpacity.value = 0
        scheduleOnRN(direction === 'left' ? handleSkip : handleMarkDelete)
      })
    },
    [translateX, cardOpacity, handleSkip, handleMarkDelete],
  )

  const panGesture = Gesture.Pan()
    .onUpdate((event) => {
      translateX.value = event.translationX
      translateY.value = event.translationY * 0.3
    })
    .onEnd((event) => {
      if (event.translationX > SWIPE_RIGHT_THRESHOLD) {
        scheduleOnRN(animateSwipe, 'right')
      } else if (event.translationX < -SWIPE_LEFT_THRESHOLD) {
        scheduleOnRN(animateSwipe, 'left')
      } else {
        scheduleOnRN(resetPosition)
      }
    })

  const cardAnimatedStyle = useAnimatedStyle(() => {
    const rotate = interpolate(translateX.value, [-SCREEN_WIDTH, 0, SCREEN_WIDTH], [-15, 0, 15])
    return {
      opacity: cardOpacity.value,
      transform: [{ translateX: translateX.value }, { translateY: translateY.value }, { rotate: `${rotate}deg` }],
    }
  })

  const skipOverlayStyle = useAnimatedStyle(() => ({
    opacity: interpolate(translateX.value, [-SCREEN_WIDTH * 0.5, 0], [1, 0], 'clamp'),
  }))

  const deleteOverlayStyle = useAnimatedStyle(() => ({
    opacity: interpolate(translateX.value, [0, SCREEN_WIDTH * 0.5], [0, 1], 'clamp'),
  }))

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
  }

  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60)
    const s = Math.floor(seconds % 60)
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  // Permission denied
  if (permissionStatus === MediaLibrary.PermissionStatus.DENIED) {
    return (
      <View style={styles.centerContainer}>
        <Ionicons name='images-outline' size={64} color='#666' />
        <Text style={styles.emptyTitle}>需要相册权限</Text>
        <Text style={styles.emptySubtitle}>请在系统设置中允许访问相册</Text>
      </View>
    )
  }

  // Loading
  if (permissionStatus === null || !isLoaded) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.emptySubtitle}>加载中...</Text>
      </View>
    )
  }

  // Empty album
  if (state.assets.length === 0) {
    return (
      <View style={styles.centerContainer}>
        <Ionicons name='images-outline' size={64} color='#666' />
        <Text style={styles.emptyTitle}>{state.selectedYear ? `${state.selectedYear} 年没有内容` : '相册为空'}</Text>
        <Text style={styles.emptySubtitle}>没有找到任何照片或视频</Text>
        <Pressable style={styles.yearDropdownLarge} onPress={() => setYearPickerVisible(true)}>
          <Ionicons name='calendar-outline' size={18} color='#ccc' />
          <Text style={styles.yearDropdownLargeText}>切换年份（当前：{state.selectedYear ?? '全部'}）</Text>
        </Pressable>

        {/* Year picker modal */}
        <Modal visible={yearPickerVisible} transparent animationType='fade'>
          <Pressable style={styles.pickerBackdrop} onPress={() => setYearPickerVisible(false)}>
            <View style={styles.pickerContainer}>
              <Text style={styles.pickerTitle}>选择年份</Text>
              <FlatList
                data={yearOptions}
                keyExtractor={(item) => String(item ?? 'all')}
                renderItem={({ item: year }) => (
                  <Pressable
                    style={[styles.pickerItem, state.selectedYear === year && styles.pickerItemActive]}
                    onPress={() => {
                      handleSelectYear(year)
                      setYearPickerVisible(false)
                    }}
                  >
                    <Text style={[styles.pickerItemText, state.selectedYear === year && styles.pickerItemTextActive]}>
                      {year ?? '全部年份'}
                    </Text>
                    {state.selectedYear === year && <Ionicons name='checkmark' size={20} color='#ff3b30' />}
                  </Pressable>
                )}
              />
            </View>
          </Pressable>
        </Modal>
      </View>
    )
  }

  // Finished
  if (isFinished) {
    return (
      <View style={styles.centerContainer}>
        <Ionicons name='checkmark-circle-outline' size={80} color='#4cd964' />
        <Text style={styles.emptyTitle}>浏览完毕！</Text>
        <Text style={styles.emptySubtitle}>已标记 {state.markedForDeletion.length} 张待删除</Text>
        {state.markedForDeletion.length > 0 && (
          <Pressable style={styles.confirmButton} onPress={() => router.push('/clean-confirm')}>
            <Text style={styles.confirmButtonText}>确认删除 ({state.markedForDeletion.length})</Text>
          </Pressable>
        )}
        <Pressable style={styles.undoButtonLarge} onPress={handleUndo}>
          <Text style={styles.undoButtonLargeText}>撤销上一步</Text>
        </Pressable>
        <Pressable style={styles.yearDropdownLarge} onPress={() => setYearPickerVisible(true)}>
          <Ionicons name='calendar-outline' size={18} color='#ccc' />
          <Text style={styles.yearDropdownLargeText}>切换年份（当前：{state.selectedYear ?? '全部'}）</Text>
        </Pressable>

        <Modal visible={yearPickerVisible} transparent animationType='fade'>
          <Pressable style={styles.pickerBackdrop} onPress={() => setYearPickerVisible(false)}>
            <View style={styles.pickerContainer}>
              <Text style={styles.pickerTitle}>选择年份</Text>
              <FlatList
                data={yearOptions}
                keyExtractor={(item) => String(item ?? 'all')}
                renderItem={({ item: year }) => (
                  <Pressable
                    style={[styles.pickerItem, state.selectedYear === year && styles.pickerItemActive]}
                    onPress={() => {
                      handleSelectYear(year)
                      setYearPickerVisible(false)
                    }}
                  >
                    <Text style={[styles.pickerItemText, state.selectedYear === year && styles.pickerItemTextActive]}>
                      {year ?? '全部年份'}
                    </Text>
                    {state.selectedYear === year && <Ionicons name='checkmark' size={20} color='#ff3b30' />}
                  </Pressable>
                )}
              />
            </View>
          </Pressable>
        </Modal>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.progress}>
          {state.currentIndex + 1} / {state.totalCount}
        </Text>
        <Pressable style={styles.yearDropdown} onPress={() => setYearPickerVisible(true)}>
          <Ionicons name='calendar-outline' size={16} color='#aaa' />
          <Text style={styles.yearDropdownText}>{state.selectedYear ?? '全部年份'}</Text>
          <Ionicons name='chevron-down' size={14} color='#aaa' />
        </Pressable>
        {state.markedForDeletion.length > 0 && (
          <Pressable style={styles.headerButton} onPress={() => router.push('/clean-confirm')}>
            <Ionicons name='trash-outline' size={20} color='#ff3b30' />
            <Text style={styles.headerBadge}>{state.markedForDeletion.length}</Text>
          </Pressable>
        )}
      </View>

      {/* Year picker modal */}
      <Modal visible={yearPickerVisible} transparent animationType='fade'>
        <Pressable style={styles.pickerBackdrop} onPress={() => setYearPickerVisible(false)}>
          <View style={styles.pickerContainer}>
            <Text style={styles.pickerTitle}>选择年份</Text>
            <FlatList
              data={yearOptions}
              keyExtractor={(item) => String(item ?? 'all')}
              renderItem={({ item: year }) => (
                <Pressable
                  style={[styles.pickerItem, state.selectedYear === year && styles.pickerItemActive]}
                  onPress={() => {
                    handleSelectYear(year)
                    setYearPickerVisible(false)
                  }}
                >
                  <Text style={[styles.pickerItemText, state.selectedYear === year && styles.pickerItemTextActive]}>
                    {year ?? '全部年份'}
                  </Text>
                  {state.selectedYear === year && <Ionicons name='checkmark' size={20} color='#ff3b30' />}
                </Pressable>
              )}
            />
          </View>
        </Pressable>
      </Modal>

      {/* Card area */}
      <View style={styles.cardContainer}>
        {/* Next card (behind) */}
        {nextAsset && (
          <View style={[styles.card, styles.nextCard]}>
            <Image source={{ uri: nextAsset.uri }} style={styles.cardImage} contentFit='contain' />
          </View>
        )}

        {/* Current card */}
        {currentAsset && (
          <GestureDetector gesture={panGesture}>
            <Animated.View style={[styles.card, cardAnimatedStyle]}>
              {livePhotoSource && livePhotoSource.assetId === currentAsset.id ? (
                <LivePhotoView source={livePhotoSource} style={styles.cardImage} contentFit='contain' />
              ) : isVideo ? (
                <VideoView player={videoPlayer} style={styles.cardImage} contentFit='contain' nativeControls={false} />
              ) : (
                <Image source={{ uri: currentAsset.uri }} style={styles.cardImage} contentFit='contain' />
              )}
              {/* Live Photo badge */}
              {livePhotoSource?.assetId === currentAsset.id && (
                <View style={styles.liveBadge}>
                  <Ionicons name='radio-button-on' size={10} color='#fff' />
                  <Text style={styles.liveBadgeText}>LIVE</Text>
                </View>
              )}
              {/* Video badge */}
              {isVideo && currentAsset.duration > 0 && (
                <View style={styles.liveBadge}>
                  <Ionicons name='videocam' size={12} color='#fff' />
                  <Text style={styles.liveBadgeText}>{formatDuration(currentAsset.duration)}</Text>
                </View>
              )}
              {/* Skip overlay */}
              <Animated.View style={[styles.overlay, styles.skipOverlay, skipOverlayStyle]}>
                <Text style={styles.overlayText}>跳过</Text>
              </Animated.View>
              {/* Delete overlay */}
              <Animated.View style={[styles.overlay, styles.deleteOverlay, deleteOverlayStyle]}>
                <Text style={styles.overlayText}>删除</Text>
              </Animated.View>
            </Animated.View>
          </GestureDetector>
        )}
      </View>

      {/* Photo info */}
      {currentAsset && (
        <View style={styles.infoBar}>
          <Text style={styles.infoText} numberOfLines={1}>
            {currentAsset.filename}
          </Text>
          <Text style={styles.infoDate}>{formatDate(currentAsset.creationTime)}</Text>
        </View>
      )}

      {/* Action buttons */}
      <View style={styles.actions}>
        <Pressable style={[styles.actionButton, styles.skipButton]} onPress={() => animateSwipe('left')}>
          <Ionicons name='close' size={32} color='#ff9500' />
        </Pressable>

        <Pressable
          style={[styles.actionButton, styles.undoButton]}
          onPress={handleUndo}
          disabled={state.actionHistory.length === 0}
        >
          <Ionicons name='arrow-undo' size={24} color={state.actionHistory.length === 0 ? '#555' : '#fff'} />
        </Pressable>

        <Pressable style={[styles.actionButton, styles.deleteButton]} onPress={() => animateSwipe('right')}>
          <Ionicons name='trash' size={32} color='#ff3b30' />
        </Pressable>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e',
  },
  centerContainer: {
    flex: 1,
    backgroundColor: '#1a1a2e',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 8,
  },
  progress: {
    color: '#aaa',
    fontSize: 16,
  },
  headerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,59,48,0.15)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  headerBadge: {
    color: '#ff3b30',
    fontSize: 14,
    fontWeight: '600',
  },
  yearDropdown: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  yearDropdownText: {
    color: '#ccc',
    fontSize: 14,
  },
  pickerBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  pickerContainer: {
    backgroundColor: '#2a2a3e',
    borderRadius: 16,
    width: SCREEN_WIDTH * 0.7,
    maxHeight: 400,
    overflow: 'hidden',
  },
  pickerTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  pickerItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  pickerItemActive: {
    backgroundColor: 'rgba(255,59,48,0.1)',
  },
  pickerItemText: {
    color: '#ccc',
    fontSize: 16,
  },
  pickerItemTextActive: {
    color: '#ff3b30',
    fontWeight: '600',
  },
  cardContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    width: SCREEN_WIDTH - 32,
    height: SCREEN_WIDTH * 1.2,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#2a2a3e',
    position: 'absolute',
  },
  nextCard: {
    transform: [{ scale: 0.95 }],
    opacity: 0.5,
  },
  cardImage: {
    width: '100%',
    height: '100%',
  },
  liveBadge: {
    position: 'absolute',
    top: 12,
    left: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
  },
  liveBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 16,
  },
  skipOverlay: {
    backgroundColor: 'rgba(255,149,0,0.4)',
  },
  deleteOverlay: {
    backgroundColor: 'rgba(255,59,48,0.4)',
  },
  overlayText: {
    color: '#fff',
    fontSize: 48,
    fontWeight: 'bold',
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 4,
  },
  infoBar: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    alignItems: 'center',
  },
  infoText: {
    color: '#ccc',
    fontSize: 14,
  },
  infoDate: {
    color: '#888',
    fontSize: 12,
    marginTop: 2,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 24,
    paddingBottom: 32,
    paddingTop: 8,
  },
  actionButton: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
  },
  skipButton: {
    borderColor: '#ff9500',
  },
  undoButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderColor: '#555',
    borderWidth: 1,
  },
  deleteButton: {
    borderColor: '#ff3b30',
  },
  emptyTitle: {
    color: '#fff',
    fontSize: 24,
    fontWeight: 'bold',
    marginTop: 16,
  },
  emptySubtitle: {
    color: '#888',
    fontSize: 16,
    marginTop: 8,
    textAlign: 'center',
  },
  confirmButton: {
    backgroundColor: '#ff3b30',
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 24,
  },
  confirmButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  undoButtonLarge: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    marginTop: 12,
  },
  undoButtonLargeText: {
    color: '#aaa',
    fontSize: 16,
    textDecorationLine: 'underline',
  },
  yearDropdownLarge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 24,
  },
  yearDropdownLargeText: {
    color: '#ccc',
    fontSize: 16,
  },
})
