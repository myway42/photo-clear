import { Stack } from 'expo-router'
import { GestureHandlerRootView } from 'react-native-gesture-handler'

import { CleanProvider } from '@/contexts/clean-context'

export default function TabLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <CleanProvider>
        <Stack>
          <Stack.Screen name='index' options={{ title: '照片清理' }} />
          <Stack.Screen name='clean' options={{ title: '照片清理' }} />
          <Stack.Screen name='clean-confirm' options={{ title: '确认删除' }} />
        </Stack>
      </CleanProvider>
    </GestureHandlerRootView>
  )
}
