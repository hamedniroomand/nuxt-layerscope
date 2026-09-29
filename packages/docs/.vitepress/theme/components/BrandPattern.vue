<script setup lang="ts">
  // Stacked layer outlines, the same shape as the logo, tiled behind the home hero.
  const patternId = 'layerscope-layers';
</script>

<template>
  <svg
    aria-hidden="true"
    focusable="false"
    class="ls-brand-pattern"
  >
    <defs>
      <pattern
        :id="patternId"
        width="240"
        height="140"
        patternUnits="userSpaceOnUse"
      >
        <g
          fill="none"
          stroke="currentColor"
          stroke-width="1"
          stroke-linejoin="round"
        >
          <path d="M60 20 100 40 60 60 20 40Z" />
          <path
            d="M20 52 60 72 100 52"
            opacity="0.6"
          />
          <path
            d="M20 64 60 84 100 64"
            opacity="0.3"
          />
          <path
            d="M180 90 220 110 180 130 140 110Z"
            opacity="0.5"
          />
          <path
            d="M140 122 180 142"
            opacity="0.3"
          />
          <circle
            cx="60"
            cy="40"
            r="2.5"
          />
          <circle
            cx="180"
            cy="110"
            r="2.5"
            opacity="0.5"
          />
        </g>
      </pattern>
    </defs>
    <rect
      width="100%"
      height="100%"
      :fill="`url(#${patternId})`"
    />
  </svg>
</template>
