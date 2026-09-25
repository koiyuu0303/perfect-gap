import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    // tsconfig の "@/*" エイリアスに合わせる
    alias: {
      "@": path.resolve(import.meta.dirname, "."),
    },
  },
  test: {
    // 音楽理論と出題ロジックは純粋関数なので DOM を必要としない。
    // ブラウザ環境が要るのは音声エンジンだけで、そこは手動で確認する。
    environment: "node",
    include: ["lib/**/*.test.ts"],
  },
});
