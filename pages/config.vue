<script setup>
import { ref, onMounted } from 'vue';

const gitlabUrl = ref('');
const gitlabToken = ref('');

const saveConfig = () => {
  if (gitlabUrl.value && gitlabToken.value) {
    localStorage.setItem('gitlab-url', gitlabUrl.value);
    localStorage.setItem('gitlab-token', gitlabToken.value);
    alert('Configuration saved!');
  } else {
    alert('Please fill in both fields.');
  }
};

onMounted(() => {
  gitlabUrl.value = localStorage.getItem('gitlab-url') || '';
  gitlabToken.value = localStorage.getItem('gitlab-token') || '';
});
</script>

<template>
  <div class="min-h-screen bg-gray-100 flex items-center justify-center">
    <div class="bg-white p-8 rounded-lg shadow-md w-full max-w-md">
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
