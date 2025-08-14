<template>
  <div class="bg-gray-100 min-h-screen font-sans">
    <header class="bg-white shadow-sm">
      <div class="container mx-auto px-4">
        <div class="flex justify-between items-center py-4">
          <NuxtLink to="/" class="text-2xl font-bold text-gray-800">MegaBoard</NuxtLink>
        </div>
      </div>
    </header>
    <main class="container mx-auto p-4">
      <NuxtPage />
    </main>
  </div>
</template>
