import { StyleSheet, Text, View } from 'react-native';

import brand from './brand.json';

export default function App() {
  return (
    <View style={styles.screen}>
      <Text style={styles.title}>{brand.displayName}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 32,
    fontWeight: '600',
  },
});
