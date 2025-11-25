import Link from "next/link";
import styles from "./page.module.css";

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

export default function Home() {
  return (
    <main className={styles.main}>
      <p className={styles.badge}>FastAPI + Next.js</p>
      <h1 className={styles.title}>AutoRouter</h1>
      <p className={styles.subtitle}>基础全栈骨架已就绪，前后端可独立迭代。</p>

      <div className={styles.links}>
        <Link className={styles.link} href={`${apiBase}/api/health`} target="_blank">
          API Health
        </Link>
        <Link className={styles.link} href={`${apiBase}/docs`} target="_blank">
          Swagger UI
        </Link>
        <Link className={styles.link} href="http://localhost:3000" target="_self">
          Frontend (本页)
        </Link>
      </div>

      <div className={styles.hint}>
        如需指向不同后端，请在前端环境变量中设置
        <code>NEXT_PUBLIC_API_BASE_URL</code>。
      </div>
    </main>
  );
}
