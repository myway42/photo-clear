import { Ionicons } from '@expo/vector-icons'
import { Link } from 'expo-router'
import { Pressable, Text, View } from 'react-native'

export default function Index() {
  return (
    <View className='flex-1 bg-dark items-center justify-center gap-3'>
      <Ionicons name='images' size={64} color='#ff3b30' />
      <Text className='text-white text-3xl font-bold mt-4'>照片清理</Text>
      <Text className='text-gray-500 text-base'>左滑跳过，右滑删除</Text>
      <Link href='/clean' asChild>
        <Pressable className='flex-row items-center gap-2 bg-danger px-8 py-4 rounded-xl mt-6'>
          <Ionicons name='play' size={22} color='#fff' />
          <Text className='text-white text-lg font-semibold'>开始清理</Text>
        </Pressable>
      </Link>
    </View>
  )
}
