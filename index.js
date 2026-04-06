/**
 * @format
 */

import { AppRegistry } from 'react-native';
import App from './App';
import { name as appName } from './app.json';
import 'react-native-get-random-values';
import { vexo } from 'vexo-analytics'; 


vexo('b28f09dd-0951-4ab5-a7d2-dd120f8c55e9')
AppRegistry.registerComponent(appName, () => App);
