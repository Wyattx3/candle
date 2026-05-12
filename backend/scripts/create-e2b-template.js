require("dotenv").config();

const path = require("path");

async function main() {
  const { Template } = await import("e2b");
  const name = process.env.E2B_TEMPLATE_NAME || process.argv[2] || "candle-autonomous-agent";
  const dockerfile = path.resolve(__dirname, "../e2b.Dockerfile");

  const template = Template()
    .fromDockerfile(dockerfile)
    .setStartCmd(
      "sleep infinity",
      "python3 --version && node --version && ffmpeg -version >/dev/null"
    );

  const build = await Template.build(template, name, {
    cpuCount: 4,
    memoryMB: 4096,
    onBuildLogs: (entry) => {
      const message = typeof entry === "string" ? entry : entry?.message;
      if (message) console.log(message);
    },
  });

  console.log(JSON.stringify({ name, templateId: build.templateId, buildId: build.buildId }, null, 2));
}

main().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});
