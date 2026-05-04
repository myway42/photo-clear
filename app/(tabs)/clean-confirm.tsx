import { Ionicons } from '@expo/vector-icons'
import { Image } from 'expo-image'
import * as MediaLibrary from 'expo-media-library'
import { useRouter } from 'expo-router'
import { useCallback, useState } from 'react'
import { Alert, Dimensions, FlatList, Modal, Pressable, Text, View } from 'react-native'

import { useCleanDispatch, useCleanState } from '@/contexts/clean-context'

const { width: SCREEN_WIDTH } = Dimensions.get('window')
const COLUMN_COUNT = 3
const GAP = 2
const THUMB_SIZE = (SCREEN_WIDTH - GAP * (COLUMN_COUNT + 1)) / COLUMN_COUNT

export default function CleanConfirmScreen() {
  const state = useCleanState()
  const dispatch = useCleanDispatch()
  const router = useRouter()
  const [previewAsset, setPreviewAsset] = useState<MediaLibrary.Asset | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteResult, setDeleteResult] = useState<{ count: number } | null>(null)

  const handleRemove = useCallback(
    (assetId: string) => {
      dispatch({ type: 'REMOVE_FROM_DELETION', assetId })
    },
    [dispatch],
  )

  const handleConfirmDelete = useCallback(() => {
    if (state.markedForDeletion.length === 0) return

    Alert.alert('确认删除', `即将删除 ${state.markedForDeletion.length} 张照片，此操作不可撤销。`, [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: async () => {
          setIsDeleting(true)
          try {
            const ids = state.markedForDeletion.map((a) => a.id)
            const success = await MediaLibrary.deleteAssetsAsync(ids)
            if (success) {
              setDeleteResult({ count: ids.length })
              dispatch({ type: 'RESET' })
            } else {
              Alert.alert('删除失败', '部分照片可能未被删除')
            }
          } catch {
            Alert.alert('删除出错', '请重试')
          } finally {
            setIsDeleting(false)
          }
        },
      },
    ])
  }, [state.markedForDeletion, dispatch])

  // Delete success result
  if (deleteResult) {
    return (
      <View className='flex-1 bg-dark items-center justify-center p-8'>
        <Ionicons name='checkmark-circle' size={80} color='#4cd964' />
        <Text className='text-white text-2xl font-bold mt-4'>删除完成</Text>
        <Text className='text-gray-400 text-base mt-2'>成功删除 {deleteResult.count} 张照片</Text>
        <Pressable className='mt-6 px-6 py-3 bg-neutral-700 rounded-lg' onPress={() => router.dismissAll()}>
          <Text className='text-white text-base'>返回首页</Text>
        </Pressable>
      </View>
    )
  }

  // Empty state
  if (state.markedForDeletion.length === 0) {
    return (
      <View className='flex-1 bg-dark items-center justify-center p-8'>
        <Ionicons name='trash-outline' size={64} color='#666' />
        <Text className='text-white text-xl font-semibold mt-4'>暂无待删除照片</Text>
        <Pressable className='mt-6 px-6 py-3 bg-neutral-700 rounded-lg' onPress={() => router.back()}>
          <Text className='text-white text-base'>返回清理</Text>
        </Pressable>
      </View>
    )
  }

  return (
    <View className='flex-1 bg-dark'>
      <FlatList
        data={state.markedForDeletion}
        numColumns={COLUMN_COUNT}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: GAP, paddingBottom: 100 }}
        renderItem={({ item }) => (
          <Pressable
            style={{ width: THUMB_SIZE, height: THUMB_SIZE, margin: GAP / 2 }}
            onPress={() => setPreviewAsset(item)}
          >
            <Image
              source={{ uri: item.uri }}
              style={{ width: '100%', height: '100%', borderRadius: 4 }}
              contentFit='cover'
            />
            <Pressable
              className='absolute top-1 right-1 bg-black/50 rounded-full'
              onPress={() => handleRemove(item.id)}
              hitSlop={8}
            >
              <Ionicons name='close-circle' size={22} color='#fff' />
            </Pressable>
          </Pressable>
        )}
      />

      {/* Bottom bar */}
      <View className='absolute bottom-0 left-0 right-0 px-5 pb-[34px] pt-3 bg-dark/95'>
        <Pressable
          className={`bg-danger py-4 rounded-xl items-center ${isDeleting ? 'opacity-50' : ''}`}
          onPress={handleConfirmDelete}
          disabled={isDeleting}
        >
          <Text className='text-white text-lg font-semibold'>
            {isDeleting ? '删除中...' : `确认删除 (${state.markedForDeletion.length} 张)`}
          </Text>
        </Pressable>
      </View>

      {/* Preview modal */}
      <Modal visible={!!previewAsset} transparent animationType='fade'>
        <View className='flex-1 bg-black/95 justify-center items-center'>
          <Pressable className='absolute top-[60px] right-5 z-10 p-2' onPress={() => setPreviewAsset(null)}>
            <Ionicons name='close' size={28} color='#fff' />
          </Pressable>
          {previewAsset && (
            <Image
              source={{ uri: previewAsset.uri }}
              style={{ width: SCREEN_WIDTH, height: SCREEN_WIDTH * 1.3 }}
              contentFit='contain'
            />
          )}
          {previewAsset && (
            <Pressable
              className='mt-6 px-6 py-3 bg-white/15 rounded-lg'
              onPress={() => {
                handleRemove(previewAsset.id)
                setPreviewAsset(null)
              }}
            >
              <Text className='text-white text-base'>取消删除此照片</Text>
            </Pressable>
          )}
        </View>
      </Modal>
    </View>
  )
}
