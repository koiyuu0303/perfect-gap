import Link from "next/link";

export default function Home() {
  return (
    <main className="flex-1 flex flex-col items-center px-6 py-16 sm:py-24">
      <div className="w-full max-w-2xl flex flex-col gap-12">
        <header className="flex flex-col gap-5">
          <p className="text-xs tracking-widest text-muted uppercase">
            Perfect Gap
          </p>

          <h1 className="text-3xl sm:text-4xl font-semibold leading-tight">
            絶対音感は、
            <br />
            相対音感の代わりにならない。
          </h1>

          <p className="text-base leading-relaxed text-muted">
            音の名前がわかることと、音と音の関係が聴こえることは別の能力です。
            このアプリは、あなたがどちらで聴いているかを測ります。
          </p>
        </header>

        <section className="rounded-xl border border-border bg-surface p-6 sm:p-8 flex flex-col gap-4">
          <h2 className="text-sm font-medium">仕組み</h2>

          <p className="text-sm leading-relaxed text-muted">
            まず和音で調を示し、続けて単音を鳴らして「調の中で何番目の音か」を
            答えてもらいます。ここまでは一般的な聴音の課題です。
          </p>

          <p className="text-sm leading-relaxed text-muted">
            違うのは、途中で
            <span className="text-foreground">
              基準となるピッチそのものを半音の半分だけずらす
            </span>
            ことです。音と音の距離は変わらないので、相対的に聴いている人には
            何の影響もありません。しかし音を絶対的な名前で識別している人は、
            ラベルが実際の音高とずれて機能しなくなります。
          </p>

          <p className="text-sm leading-relaxed text-muted border-t border-border pt-4">
            この
            <span className="text-foreground">ずらす前とずらした後の差</span>
            が、絶対的な音高への依存度を直接表します。
            上手い下手ではなく、聴き方の癖を測る指標です。
          </p>
        </section>

        <section className="flex flex-col gap-4">
          <Link
            href="/diagnostic"
            className="self-start px-8 py-3 rounded-lg bg-accent text-accent-foreground font-medium hover:opacity-90 transition-opacity"
          >
            診断をはじめる
          </Link>

          <p className="text-xs text-muted">
            全20問・約5分 · 登録不要 · ヘッドホン推奨
          </p>
        </section>

        <footer className="flex flex-col gap-3 border-t border-border pt-6">
          <p className="text-xs text-muted leading-relaxed">
            絶対音感保持者がハ長調以外の文脈で音程判断の成績を落とすことは、
            音楽認知の研究で報告されています。本アプリはその知見を出発点に、
            個人の依存度を測定し、訓練によって変化するかを追跡することを目的としています。
          </p>

          <p className="text-xs text-muted leading-relaxed">
            ピアノ音源:{" "}
            <a
              href="https://archive.org/details/SalamanderGrandPianoV3"
              target="_blank"
              rel="noreferrer noopener"
              className="underline hover:text-foreground transition-colors"
            >
              Salamander Grand Piano
            </a>{" "}
            by Alexander Holm (
            <a
              href="https://creativecommons.org/licenses/by/3.0/"
              target="_blank"
              rel="noreferrer noopener"
              className="underline hover:text-foreground transition-colors"
            >
              CC BY 3.0
            </a>
            )
          </p>
        </footer>
      </div>
    </main>
  );
}
