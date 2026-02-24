import { Ionicons } from '@expo/vector-icons'
import { Link } from 'expo-router'
import { Pressable, StyleSheet, Text, View } from 'react-native'

export default function Index() {
  return (
    <View style={styles.container}>
      <Ionicons name='images' size={64} color='#ff3b30' />
      <Text style={styles.title}>照片清理</Text>
      <Text style={styles.subtitle}>左滑跳过，右滑删除</Text>
      <Link href='/clean' asChild>
        <Pressable style={styles.cleanButton}>
          <Ionicons name='play' size={22} color='#fff' />
          <Text style={styles.cleanButtonText}>开始清理</Text>
        </Pressable>
      </Link>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  title: {
    color: '#fff',
    fontSize: 28,
    fontWeight: 'bold',
    marginTop: 16,
  },
  subtitle: {
    color: '#888',
    fontSize: 16,
  },
  cleanButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#ff3b30',
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 14,
    marginTop: 24,
  },
  cleanButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
})
