// App.tsx — Root of BenchmarkX Native
// Navigation setup with 3 screens: Home, Benchmark, Compare

import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import HomeScreen from './screens/HomeScreen';
import BenchmarkScreen from './screens/BenchmarkScreen';
import CompareScreen from './screens/CompareScreen';
import { Colors } from './constants/theme';
import { ErrorBoundary } from './components/ErrorBoundary';
import { BenchmarkResult } from './lib/scoreCalculator';

export type RootStackParamList = {
  Home: undefined;
  Benchmark: undefined;
  Compare: { result?: BenchmarkResult } | undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function App() {
  return (
    <ErrorBoundary fallbackLabel="App">
      <SafeAreaProvider>
        <NavigationContainer>
          <Stack.Navigator
            initialRouteName="Home"
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: Colors.bgDark },
              animation: 'slide_from_right',
            }}
          >
            <Stack.Screen name="Home" component={HomeScreen} />
            <Stack.Screen name="Benchmark" component={BenchmarkScreen} />
            <Stack.Screen name="Compare" component={CompareScreen} />
          </Stack.Navigator>
        </NavigationContainer>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}
