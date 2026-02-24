import { Ionicons } from '@expo/vector-icons'
import { Image } from 'expo-image'
import * as MediaLibrary from 'expo-media-library'
import { useRouter } from 'expo-router'
import { useCallback, useState } from 'react'
import { Alert, Dimensions, FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native'

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
      <View style={styles.centerContainer}>
        <Ionicons name='checkmark-circle' size={80} color='#4cd964' />
        <Text style={styles.resultTitle}>删除完成</Text>
        <Text style={styles.resultSubtitle}>成功删除 {deleteResult.count} 张照片</Text>
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backButtonText}>返回首页</Text>
        </Pressable>
      </View>
    )
  }

  // Empty state
  if (state.markedForDeletion.length === 0) {
    return (
      <View style={styles.centerContainer}>
        <Ionicons name='trash-outline' size={64} color='#666' />
        <Text style={styles.emptyTitle}>暂无待删除照片</Text>
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backButtonText}>返回清理</Text>
        </Pressable>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={state.markedForDeletion}
        numColumns={COLUMN_COUNT}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.grid}
        renderItem={({ item }) => (
          <Pressable style={styles.thumbWrapper} onPress={() => setPreviewAsset(item)}>
            <Image source={{ uri: item.uri }} style={styles.thumb} contentFit='cover' />
            <Pressable style={styles.removeButton} onPress={() => handleRemove(item.id)} hitSlop={8}>
              <Ionicons name='close-circle' size={22} color='#fff' />
            </Pressable>
          </Pressable>
        )}
      />

      {/* Bottom bar */}
      <View style={styles.bottomBar}>
        <Pressable
          style={[styles.deleteAllButton, isDeleting && styles.deleteAllButtonDisabled]}
          onPress={handleConfirmDelete}
          disabled={isDeleting}
        >
          <Text style={styles.deleteAllText}>
            {isDeleting ? '删除中...' : `确认删除 (${state.markedForDeletion.length} 张)`}
          </Text>
        </Pressable>
      </View>

      {/* Preview modal */}
      <Modal visible={!!previewAsset} transparent animationType='fade'>
        <View style={styles.modalBackdrop}>
          <Pressable style={styles.modalClose} onPress={() => setPreviewAsset(null)}>
            <Ionicons name='close' size={28} color='#fff' />
          </Pressable>
          {previewAsset && (
            <Image source={{ uri: previewAsset.uri }} style={styles.previewImage} contentFit='contain' />
          )}
          {previewAsset && (
            <Pressable
              style={styles.modalRemoveButton}
              onPress={() => {
                handleRemove(previewAsset.id)
                setPreviewAsset(null)
              }}
            >
              <Text style={styles.modalRemoveText}>取消删除此照片</Text>
            </Pressable>
          )}
        </View>
      </Modal>
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
  grid: {
    padding: GAP,
    paddingBottom: 100,
  },
  thumbWrapper: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    margin: GAP / 2,
    position: 'relative',
  },
  thumb: {
    width: '100%',
    height: '100%',
    borderRadius: 4,
  },
  removeButton: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 11,
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    paddingBottom: 34,
    paddingTop: 12,
    backgroundColor: 'rgba(26,26,46,0.95)',
  },
  deleteAllButton: {
    backgroundColor: '#ff3b30',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  deleteAllButtonDisabled: {
    opacity: 0.5,
  },
  deleteAllText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  emptyTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '600',
    marginTop: 16,
  },
  backButton: {
    marginTop: 24,
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: '#333',
    borderRadius: 10,
  },
  backButtonText: {
    color: '#fff',
    fontSize: 16,
  },
  resultTitle: {
    color: '#fff',
    fontSize: 24,
    fontWeight: 'bold',
    marginTop: 16,
  },
  resultSubtitle: {
    color: '#aaa',
    fontSize: 16,
    marginTop: 8,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.95)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalClose: {
    position: 'absolute',
    top: 60,
    right: 20,
    zIndex: 1,
    padding: 8,
  },
  previewImage: {
    width: SCREEN_WIDTH,
    height: SCREEN_WIDTH * 1.3,
  },
  modalRemoveButton: {
    marginTop: 24,
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 10,
  },
  modalRemoveText: {
    color: '#fff',
    fontSize: 16,
  },
})
