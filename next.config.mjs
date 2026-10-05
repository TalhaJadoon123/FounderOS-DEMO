/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  // Isolate the build output dir via env so a production build can run on its
  // own port without clobbering a concurrent `next dev` (which keeps `.next`).
  distDir: process.env.NEXT_DIST_DIR || '.next',
  // Several connectors resolve paths with os.homedir() (lib/creds.ts,
  // lib/brain-dump.ts, skills-catalog), so output-file tracing walks up to the
  // user profile and then fails on the protected Windows junction
  // "Application Data" -> AppData\Roaming:
  //   EPERM: operation not permitted, scandir 'C:\Users\<user>\Application Data'
  // Nothing outside the repo needs tracing, and `next start` does not use the
  // trace at all. Turning it off avoids the whole scan.
  outputFileTracing: false,
  // The commit limit on this box is the binding constraint: the pagefile is
  // manually pinned at 4 GB + 512 MB, so the compiler exhausts commit and is
  // killed part-way through "Creating an optimized production build" with no
  // error in the log. One minify worker is the lever that fits inside it.
  experimental: {
    // Runs instrumentation.ts on server boot (Next 14 needs the opt-in).
    instrumentationHook: true,
    serverComponentsExternalPackages: ['better-sqlite3', 'node-ical', 'nodemailer'],
    // webpack spawns one minify worker per CPU by default, and each holds the
    // whole module graph. One keeps peak commit usage to roughly a quarter.
    cpus: 1,
    // Keep output-file tracing inside the project. Several connectors resolve
    // paths with os.homedir() (lib/creds.ts, lib/brain-dump.ts, skills-catalog),
    // so the default tracing root walks up to the user profile and then fails on
    // the protected Windows junction "Application Data" -> AppData\Roaming:
    //   EPERM: operation not permitted, scandir 'C:\Users\<user>\Application Data'
    // Nothing outside the repo needs to be traced, so pin the root to the repo.
    // (Next 14 keeps this under `experimental`; it was promoted to the top
    // level in Next 15.)
    outputFileTracingRoot: process.cwd(),
  },
};

export default nextConfig;
