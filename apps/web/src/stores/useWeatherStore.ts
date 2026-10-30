import type { AirportWeather } from '@towerwhisper/shared';
import { defineStore } from 'pinia';
import { ref } from 'vue';

/** Live airport weather, pushed by the backend (weather:update). */
export const useWeatherStore = defineStore('weather', () => {
  const current = ref<AirportWeather | null>(null);

  function set(weather: AirportWeather): void {
    current.value = weather;
  }

  return { current, set };
});
