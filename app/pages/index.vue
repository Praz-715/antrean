<script setup lang="ts">
definePageMeta({ layout: 'default' })
useHead({ title: 'Beranda' })
</script>

<template>
  <div class="flex min-h-screen items-center justify-center p-6">
    <div class="text-center">
      <h1 class="text-4xl font-extrabold tracking-tight">ANTREAN</h1>
      <p class="mt-2 text-slate-500">Kelola Antrean. Layani Lebih Cepat.</p>
      <UButton to="/login" class="mt-6" size="lg">Masuk</UButton>
    </div>
  </div>
</template>
