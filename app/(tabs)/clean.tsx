import { Ionicons } from '@expo/vector-icons'
import * as Haptics from 'expo-haptics'
import { Image } from 'expo-image'
import { LivePhotoView } from 'expo-live-photo'
import * as MediaLibrary from 'expo-media-library'
import { useRouter } from 'expo-router'
import { useVideoPlayer, VideoView } from 'expo-video'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Dimensions, FlatList, Modal, Platform, Pressable, Text, View } from 'react-native'
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
      <View className='flex-1 bg-dark items-center justify-center p-8'>
        <Ionicons name='images-outline' size={64} color='#666' />
        <Text className='text-white text-2xl font-bold mt-4'>需要相册权限</Text>
        <Text className='text-gray-500 text-base mt-2 text-center'>请在系统设置中允许访问相册</Text>
      </View>
    )
  }

  // Loading
  if (permissionStatus === null || !isLoaded) {
    return (
      <View className='flex-1 bg-dark items-center justify-center p-8'>
        <Text className='text-gray-500 text-base mt-2 text-center'>加载中...</Text>
      </View>
    )
  }

  // Empty album
  if (state.assets.length === 0) {
    return (
      <View className='flex-1 bg-dark items-center justify-center p-8'>
        <Ionicons name='images-outline' size={64} color='#666' />
        <Text className='text-white text-2xl font-bold mt-4'>
          {state.selectedYear ? `${state.selectedYear} 年没有内容` : '相册为空'}
        </Text>
        <Text className='text-gray-500 text-base mt-2 text-center'>没有找到任何照片或视频</Text>
        <Pressable
          className='flex-row items-center gap-2 bg-white/[0.08] px-5 py-3 rounded-xl mt-6'
          onPress={() => setYearPickerVisible(true)}
        >
          <Ionicons name='calendar-outline' size={18} color='#ccc' />
          <Text className='text-gray-300 text-base'>切换年份（当前：{state.selectedYear ?? '全部'}）</Text>
        </Pressable>

        {/* Year picker modal */}
        <Modal visible={yearPickerVisible} transparent animationType='fade'>
          <Pressable
            className='flex-1 bg-black/60 justify-center items-center'
            onPress={() => setYearPickerVisible(false)}
          >
            <View
              className='bg-dark-card rounded-2xl overflow-hidden'
              style={{ width: SCREEN_WIDTH * 0.7, maxHeight: 400 }}
            >
              <Text className='text-white text-base font-semibold text-center py-3.5 border-b border-white/10'>
                选择年份
              </Text>
              <FlatList
                data={yearOptions}
                keyExtractor={(item) => String(item ?? 'all')}
                renderItem={({ item: year }) => (
                  <Pressable
                    className={`flex-row justify-between items-center px-5 py-3.5 ${state.selectedYear === year ? 'bg-danger/10' : ''}`}
                    onPress={() => {
                      handleSelectYear(year)
                      setYearPickerVisible(false)
                    }}
                  >
                    <Text
                      className={`text-base ${state.selectedYear === year ? 'text-danger font-semibold' : 'text-gray-300'}`}
                    >
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
      <View className='flex-1 bg-dark items-center justify-center p-8'>
        <Ionicons name='checkmark-circle-outline' size={80} color='#4cd964' />
        <Text className='text-white text-2xl font-bold mt-4'>浏览完毕！</Text>
        <Text className='text-gray-500 text-base mt-2 text-center'>
          已标记 {state.markedForDeletion.length} 张待删除
        </Text>
        {state.markedForDeletion.length > 0 && (
          <Pressable className='bg-danger px-8 py-3.5 rounded-xl mt-6' onPress={() => router.push('/clean-confirm')}>
            <Text className='text-white text-lg font-semibold'>确认删除 ({state.markedForDeletion.length})</Text>
          </Pressable>
        )}
        <Pressable className='px-6 py-3 mt-3' onPress={handleUndo}>
          <Text className='text-gray-400 text-base underline'>撤销上一步</Text>
        </Pressable>
        <Pressable
          className='flex-row items-center gap-2 bg-white/[0.08] px-5 py-3 rounded-xl mt-6'
          onPress={() => setYearPickerVisible(true)}
        >
          <Ionicons name='calendar-outline' size={18} color='#ccc' />
          <Text className='text-gray-300 text-base'>切换年份（当前：{state.selectedYear ?? '全部'}）</Text>
        </Pressable>

        <Modal visible={yearPickerVisible} transparent animationType='fade'>
          <Pressable
            className='flex-1 bg-black/60 justify-center items-center'
            onPress={() => setYearPickerVisible(false)}
          >
            <View
              className='bg-dark-card rounded-2xl overflow-hidden'
              style={{ width: SCREEN_WIDTH * 0.7, maxHeight: 400 }}
            >
              <Text className='text-white text-base font-semibold text-center py-3.5 border-b border-white/10'>
                选择年份
              </Text>
              <FlatList
                data={yearOptions}
                keyExtractor={(item) => String(item ?? 'all')}
                renderItem={({ item: year }) => (
                  <Pressable
                    className={`flex-row justify-between items-center px-5 py-3.5 ${state.selectedYear === year ? 'bg-danger/10' : ''}`}
                    onPress={() => {
                      handleSelectYear(year)
                      setYearPickerVisible(false)
                    }}
                  >
                    <Text
                      className={`text-base ${state.selectedYear === year ? 'text-danger font-semibold' : 'text-gray-300'}`}
                    >
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
    <View className='flex-1 bg-dark'>
      {/* Header */}
      <View className='flex-row justify-between items-center px-5 py-2'>
        <Text className='text-gray-400 text-base'>
          {state.currentIndex + 1} / {state.totalCount}
        </Text>
        <Pressable
          className='flex-row items-center gap-1.5 bg-white/[0.08] px-3 py-1.5 rounded-2xl'
          onPress={() => setYearPickerVisible(true)}
        >
          <Ionicons name='calendar-outline' size={16} color='#aaa' />
          <Text className='text-gray-300 text-sm'>{state.selectedYear ?? '全部年份'}</Text>
          <Ionicons name='chevron-down' size={14} color='#aaa' />
        </Pressable>
        {state.markedForDeletion.length > 0 && (
          <Pressable
            className='flex-row items-center gap-1 bg-danger/[0.15] px-3 py-1.5 rounded-2xl'
            onPress={() => router.push('/clean-confirm')}
          >
            <Ionicons name='trash-outline' size={20} color='#ff3b30' />
            <Text className='text-danger text-sm font-semibold'>{state.markedForDeletion.length}</Text>
          </Pressable>
        )}
      </View>

      {/* Year picker modal */}
      <Modal visible={yearPickerVisible} transparent animationType='fade'>
        <Pressable
          className='flex-1 bg-black/60 justify-center items-center'
          onPress={() => setYearPickerVisible(false)}
        >
          <View
            className='bg-dark-card rounded-2xl overflow-hidden'
            style={{ width: SCREEN_WIDTH * 0.7, maxHeight: 400 }}
          >
            <Text className='text-white text-base font-semibold text-center py-3.5 border-b border-white/10'>
              选择年份
            </Text>
            <FlatList
              data={yearOptions}
              keyExtractor={(item) => String(item ?? 'all')}
              renderItem={({ item: year }) => (
                <Pressable
                  className={`flex-row justify-between items-center px-5 py-3.5 ${state.selectedYear === year ? 'bg-danger/10' : ''}`}
                  onPress={() => {
                    handleSelectYear(year)
                    setYearPickerVisible(false)
                  }}
                >
                  <Text
                    className={`text-base ${state.selectedYear === year ? 'text-danger font-semibold' : 'text-gray-300'}`}
                  >
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
      <View className='flex-1 items-center justify-center'>
        {/* Next card (behind) */}
        {nextAsset && (
          <View
            className='rounded-2xl overflow-hidden bg-dark-card absolute'
            style={{ width: SCREEN_WIDTH - 32, height: SCREEN_WIDTH * 1.2, transform: [{ scale: 0.95 }], opacity: 0.5 }}
          >
            <Image source={{ uri: nextAsset.uri }} style={{ width: '100%', height: '100%' }} contentFit='contain' />
          </View>
        )}

        {/* Current card */}
        {currentAsset && (
          <GestureDetector gesture={panGesture}>
            <Animated.View
              className='rounded-2xl overflow-hidden bg-dark-card absolute'
              style={[{ width: SCREEN_WIDTH - 32, height: SCREEN_WIDTH * 1.2 }, cardAnimatedStyle]}
            >
              {livePhotoSource && livePhotoSource.assetId === currentAsset.id ? (
                <LivePhotoView
                  source={livePhotoSource}
                  style={{ width: '100%', height: '100%' }}
                  contentFit='contain'
                />
              ) : isVideo ? (
                <VideoView
                  player={videoPlayer}
                  style={{ width: '100%', height: '100%' }}
                  contentFit='contain'
                  nativeControls={false}
                />
              ) : (
                <Image
                  source={{ uri: currentAsset.uri }}
                  style={{ width: '100%', height: '100%' }}
                  contentFit='contain'
                />
              )}
              {/* Live Photo badge */}
              {livePhotoSource?.assetId === currentAsset.id && (
                <View className='absolute top-3 left-3 flex-row items-center gap-1 bg-black/50 px-2 py-1 rounded-lg'>
                  <Ionicons name='radio-button-on' size={10} color='#fff' />
                  <Text className='text-white text-[11px] font-semibold tracking-wide'>LIVE</Text>
                </View>
              )}
              {/* Video badge */}
              {isVideo && currentAsset.duration > 0 && (
                <View className='absolute top-3 left-3 flex-row items-center gap-1 bg-black/50 px-2 py-1 rounded-lg'>
                  <Ionicons name='videocam' size={12} color='#fff' />
                  <Text className='text-white text-[11px] font-semibold tracking-wide'>
                    {formatDuration(currentAsset.duration)}
                  </Text>
                </View>
              )}
              {/* Skip overlay */}
              <Animated.View
                className='absolute inset-0 justify-center items-center rounded-2xl bg-warning/40'
                style={skipOverlayStyle}
              >
                <Text
                  style={{
                    color: '#fff',
                    fontSize: 48,
                    fontWeight: 'bold',
                    textShadowColor: 'rgba(0,0,0,0.5)',
                    textShadowOffset: { width: 1, height: 1 },
                    textShadowRadius: 4,
                  }}
                >
                  跳过
                </Text>
              </Animated.View>
              {/* Delete overlay */}
              <Animated.View
                className='absolute inset-0 justify-center items-center rounded-2xl bg-danger/40'
                style={deleteOverlayStyle}
              >
                <Text
                  style={{
                    color: '#fff',
                    fontSize: 48,
                    fontWeight: 'bold',
                    textShadowColor: 'rgba(0,0,0,0.5)',
                    textShadowOffset: { width: 1, height: 1 },
                    textShadowRadius: 4,
                  }}
                >
                  删除
                </Text>
              </Animated.View>
            </Animated.View>
          </GestureDetector>
        )}
      </View>

      {/* Photo info */}
      {currentAsset && (
        <View className='px-5 py-3 items-center'>
          <Text className='text-gray-300 text-sm' numberOfLines={1}>
            {currentAsset.filename}
          </Text>
          <Text className='text-gray-500 text-xs mt-0.5'>{formatDate(currentAsset.creationTime)}</Text>
        </View>
      )}

      {/* Action buttons */}
      <View className='flex-row justify-center items-center gap-6 pb-8 pt-2'>
        <Pressable
          className='w-[60px] h-[60px] rounded-full justify-center items-center border-2 border-warning'
          onPress={() => animateSwipe('left')}
        >
          <Ionicons name='close' size={32} color='#ff9500' />
        </Pressable>

        <Pressable
          className='w-12 h-12 rounded-full justify-center items-center border border-gray-600'
          onPress={handleUndo}
          disabled={state.actionHistory.length === 0}
        >
          <Ionicons name='arrow-undo' size={24} color={state.actionHistory.length === 0 ? '#555' : '#fff'} />
        </Pressable>

        <Pressable
          className='w-[60px] h-[60px] rounded-full justify-center items-center border-2 border-danger'
          onPress={() => animateSwipe('right')}
        >
          <Ionicons name='trash' size={32} color='#ff3b30' />
        </Pressable>
      </View>
    </View>
  )
}
