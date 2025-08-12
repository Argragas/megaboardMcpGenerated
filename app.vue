<template>
  <div class="bg-gray-100 min-h-screen font-sans">
    <header class="bg-white shadow-sm">
      <div class="container mx-auto px-4">
        <div class="flex justify-between items-center py-4">
          <NuxtLink to="/" class="text-2xl font-bold text-gray-800">MegaBoard</NuxtLink>
          <NuxtLink to="/config" class="flex items-center text-gray-600 hover:text-blue-600">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 mr-1" viewBox="0 0 20 20" fill="currentColor">
              <path fill-rule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0L7.86 5.25A2.5 2.5 0 015.25 7.86l-2.08.65c-1.56.38-1.56 2.6 0 2.98l2.08.65A2.5 2.5 0 017.86 14.75l.65 2.08c.38 1.56 2.6 1.56 2.98 0l.65-2.08a2.5 2.5 0 012.6-2.6l2.08-.65c1.56-.38 1.56-2.6 0-2.98l-2.08-.65a2.5 2.5 0 01-2.6-2.6L11.49 3.17zm-1.87 7.7a1.5 1.5 0 100-3 1.5 1.5 0 000 3z" clip-rule="evenodd" />
            </svg>
            <span>Configuration</span>
          </NuxtLink>
        </div>
      </div>
    </header>
    <main class="container mx-auto p-4">
      <NuxtPage />
    </main>
  </div>
</template>
