import { Ionicons } from '@expo/vector-icons'
import * as MediaLibrary from 'expo-media-library'
import { useFocusEffect, useRouter } from 'expo-router'
import { useCallback, useEffect, useState } from 'react'
import { FlatList, Pressable, Text, View } from 'react-native'

import { useCleanDispatch, useCleanState } from '@/contexts/clean-context'

type PeriodOption = { year: number; month: number; count: number }

export default function Index() {
  const state = useCleanState()
  const dispatch = useCleanDispatch()
  const router = useRouter()
  const [permissionStatus, setPermissionStatus] = useState<MediaLibrary.PermissionStatus | null>(null)
  const [periodOptions, setPeriodOptions] = useState<PeriodOption[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [loading, setLoading] = useState(true)

  const loadPeriodOptions = useCallback(async () => {
    const currentDate = new Date()
    const currentYear = currentDate.getFullYear()
    const currentMonth = currentDate.getMonth() + 1
    const [totalResult, oldest] = await Promise.all([
      MediaLibrary.getAssetsAsync({
        first: 1,
        mediaType: [MediaLibrary.MediaType.photo, MediaLibrary.MediaType.video],
      }),
      MediaLibrary.getAssetsAsync({
        first: 1,
        sortBy: [[MediaLibrary.SortBy.creationTime, true]],
        mediaType: [MediaLibrary.MediaType.photo, MediaLibrary.MediaType.video],
      }),
    ])
    setTotalCount(totalResult.totalCount)

    let startYear = currentYear - 5
    let startMonth = 1
    if (oldest.assets.length > 0) {
      const d = new Date(oldest.assets[0].creationTime)
      startYear = d.getFullYear()
      startMonth = d.getMonth() + 1
    }

    const monthQueries: { year: number; month: number }[] = []
    for (let y = currentYear; y >= startYear; y--) {
      const mStart = y === currentYear ? currentMonth : 12
      const mEnd = y === startYear ? startMonth : 1
      for (let m = mStart; m >= mEnd; m--) {
        monthQueries.push({ year: y, month: m })
      }
    }

    const results = await Promise.all(
      monthQueries.map(({ year, month }) =>
        MediaLibrary.getAssetsAsync({
          first: 1,
          mediaType: [MediaLibrary.MediaType.photo, MediaLibrary.MediaType.video],
          createdAfter: new Date(year, month - 1, 1),
          createdBefore: new Date(year, month, 1),
        }).then((result) => ({ year, month, count: result.totalCount })),
      ),
    )

    setPeriodOptions(results.filter((r) => r.count > 0))
    setLoading(false)
  }, [])

  useEffect(() => {
    ;(async () => {
      const { status } = await MediaLibrary.requestPermissionsAsync()
      setPermissionStatus(status)
      if (status === MediaLibrary.PermissionStatus.GRANTED) {
        loadPeriodOptions()
      } else {
        setLoading(false)
      }
    })()
  }, [loadPeriodOptions])

  // Reload counts when returning to this screen (e.g. after deletion)
  useFocusEffect(
    useCallback(() => {
      if (permissionStatus === MediaLibrary.PermissionStatus.GRANTED) {
        loadPeriodOptions()
      }
    }, [permissionStatus, loadPeriodOptions]),
  )

  const handleSelectPeriod = useCallback(
    (year: number | null, month: number | null) => {
      dispatch({ type: 'SET_YEAR', year, month })
      router.push('/clean')
    },
    [dispatch, router],
  )

  if (permissionStatus === MediaLibrary.PermissionStatus.DENIED) {
    return (
      <View className='flex-1 bg-dark items-center justify-center p-8'>
        <Ionicons name='images-outline' size={64} color='#666' />
        <Text className='text-white text-2xl font-bold mt-4'>需要相册权限</Text>
        <Text className='text-gray-500 text-base mt-2 text-center'>请在系统设置中允许访问相册</Text>
      </View>
    )
  }

  if (loading) {
    return (
      <View className='flex-1 bg-dark items-center justify-center'>
        <Text className='text-gray-500 text-base'>加载中...</Text>
      </View>
    )
  }

  // Group options by year
  const years = [...new Set(periodOptions.map((o) => o.year))]

  return (
    <View className='flex-1 bg-dark'>
      <FlatList
        data={periodOptions}
        keyExtractor={(item) => `${item.year}-${item.month}`}
        contentContainerStyle={{ paddingBottom: 40 }}
        ListHeaderComponent={
          <View className='px-5 pt-6 pb-4'>
            <Text className='text-white text-3xl font-bold'>照片清理</Text>
            <Text className='text-gray-500 text-base mt-1'>左滑跳过，右滑删除</Text>
            {/* All photos entry */}
            <Pressable
              className='flex-row justify-between items-center bg-danger/10 rounded-xl px-5 py-4 mt-4'
              onPress={() => handleSelectPeriod(null, null)}
            >
              <View className='flex-row items-center gap-3'>
                <Ionicons name='images' size={24} color='#ff3b30' />
                <Text className='text-white text-lg font-semibold'>全部照片</Text>
              </View>
              <View className='flex-row items-center gap-2'>
                <Text className='text-gray-400 text-base'>
                  {state.reviewedIds.size}/{totalCount}
                </Text>
                <Ionicons name='chevron-forward' size={18} color='#666' />
              </View>
            </Pressable>
          </View>
        }
        stickyHeaderIndices={years.map((year) => {
          const firstIndex = periodOptions.findIndex((o) => o.year === year)
          return firstIndex + 1 // +1 for ListHeaderComponent
        })}
        renderItem={({ item, index }) => {
          const isFirstOfYear = index === 0 || periodOptions[index - 1].year !== item.year
          const periodKey = `${item.year}-${item.month}`
          const reviewedCount = state.reviewedByPeriod[periodKey] ?? 0
          const isComplete = reviewedCount >= item.count
          return (
            <>
              {isFirstOfYear && (
                <View className='bg-dark px-5 pt-4 pb-2'>
                  <Text className='text-gray-400 text-sm font-semibold'>{item.year}年</Text>
                </View>
              )}
              <Pressable
                className='flex-row justify-between items-center px-5 py-3.5 mx-4 rounded-lg active:bg-white/5'
                onPress={() => handleSelectPeriod(item.year, item.month)}
              >
                <Text className='text-white text-base'>{item.month}月</Text>
                <View className='flex-row items-center gap-2'>
                  <Text className={`text-sm ${isComplete ? 'text-green-500' : 'text-gray-500'}`}>
                    {reviewedCount}/{item.count}
                  </Text>
                  {isComplete && <Ionicons name='checkmark-circle' size={16} color='#4cd964' />}
                  <Ionicons name='chevron-forward' size={16} color='#555' />
                </View>
              </Pressable>
            </>
          )
        }}
      />
    </View>
  )
}
