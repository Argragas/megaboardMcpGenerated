<script setup>
import { ref, onMounted } from 'vue';

const gitlabUrl = ref('');
const gitlabToken = ref('');
const projectColors = ref([]);
const refreshIntervalMinutes = ref(5);
const columnOrder = ref('');

const defaultProjectColors = [
  '#f87171', '#fb923c', '#fbbf24', '#a3e635', '#4ade80', '#34d399',
  '#2dd4bf', '#22d3ee', '#38bdf8', '#60a5fa', '#818cf8', '#a78bfa',
  '#c084fc', '#e879f9', '#f472b6', '#fb7185'
];

const saveConfig = () => {
  if (gitlabUrl.value && gitlabToken.value) {
    localStorage.setItem('gitlab-url', gitlabUrl.value);
    localStorage.setItem('gitlab-token', gitlabToken.value);
    localStorage.setItem('project-colors', JSON.stringify(projectColors.value));
    localStorage.setItem('refresh-interval', refreshIntervalMinutes.value * 60000);
    localStorage.setItem('column-order', columnOrder.value);
    alert('Configuration saved!');
  } else {
    alert('Please fill in both fields.');
  }
};

onMounted(() => {
  gitlabUrl.value = localStorage.getItem('gitlab-url') || '';
  gitlabToken.value = localStorage.getItem('gitlab-token') || '';
  columnOrder.value = localStorage.getItem('column-order') || '';

  const savedColors = localStorage.getItem('project-colors');
  if (savedColors) {
    projectColors.value = JSON.parse(savedColors);
  } else {
    projectColors.value = [...defaultProjectColors];
  }

  const savedInterval = localStorage.getItem('refresh-interval');
  if (savedInterval) {
    refreshIntervalMinutes.value = parseInt(savedInterval, 10) / 60000;
  }
});

const addColor = () => {
  projectColors.value.push('#000000');
};

const removeColor = (index) => {
  projectColors.value.splice(index, 1);
};

const resetColors = () => {
  projectColors.value = [...defaultProjectColors];
  localStorage.setItem('project-colors', JSON.stringify(projectColors.value));
};
</script>

<template>
  <div class="min-h-screen bg-gray-100 flex items-center justify-center">
    <div class="bg-white p-8 rounded-lg shadow-md w-full max-w-lg">
      <h1 class="text-2xl font-bold mb-6 text-center">Configuration</h1>
      <form @submit.prevent="saveConfig">
        <div class="mb-4">
          <label for="gitlabUrl" class="block text-gray-700 font-bold mb-2">GitLab URL</label>
          <input
            id="gitlabUrl"
            v-model="gitlabUrl"
            type="text"
            placeholder="https://gitlab.com"
            class="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring focus:border-blue-300"
          />
        </div>
        <div class="mb-6">
          <label for="gitlabToken" class="block text-gray-700 font-bold mb-2">Personal Access Token</label>
          <input
            id="gitlabToken"
            v-model="gitlabToken"
            type="password"
            placeholder="your-token"
            class="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring focus:border-blue-300"
          />
        </div>

        <div class="mb-6">
            <label for="refreshInterval" class="block text-gray-700 font-bold mb-2">Auto-refresh Interval (minutes)</label>
            <input
                id="refreshInterval"
                v-model.number="refreshIntervalMinutes"
                type="number"
                min="0"
                placeholder="5"
                class="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring focus:border-blue-300"
            />
            <p class="text-xs text-gray-600 mt-1">Set to 0 to disable auto-refresh.</p>
        </div>

        <div class="mb-6">
            <label for="columnOrder" class="block text-gray-700 font-bold mb-2">Custom Column Order</label>
            <textarea
                id="columnOrder"
                v-model="columnOrder"
                placeholder="To Do, Doing, In Review, Done"
                class="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring focus:border-blue-300"
                rows="3"
            ></textarea>
            <p class="text-xs text-gray-600 mt-1">Enter column names separated by commas. Columns not listed here will appear at the end, sorted alphabetically.</p>
        </div>

        <div class="mb-6">
          <h2 class="text-xl font-bold mb-4">Project Label Colors</h2>
          <div class="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-4">
            <div v-for="(color, index) in projectColors" :key="index" class="relative group">
              <input
                type="color"
                v-model="projectColors[index]"
                class="w-12 h-12 p-1 border rounded-full cursor-pointer"
              />
              <button @click.prevent="removeColor(index)" class="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                &times;
              </button>
            </div>
          </div>
          <div class="mt-4 flex gap-2">
            <button @click.prevent="addColor" class="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg">
              Add Color
            </button>
            <button @click.prevent="resetColors" class="bg-gray-500 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded-lg">
              Reset to Default
            </button>
          </div>
        </div>

        <button
          type="submit"
          class="w-full bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg focus:outline-none focus:shadow-outline"
        >
          Save Configuration
        </button>
      </form>
    </div>
  </div>
</template>
