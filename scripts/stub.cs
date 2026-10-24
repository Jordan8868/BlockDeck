using System;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Text;

[assembly: AssemblyTitle("BlockDeck Launcher")]
[assembly: AssemblyDescription("BlockDeck 方块工坊 Minecraft Java 版启动器")]
[assembly: AssemblyCompany("Jordan8868")]
[assembly: AssemblyProduct("BlockDeck")]
[assembly: AssemblyCopyright("Copyright © 2026 Jordan8868")]
[assembly: AssemblyVersion("1.1.0.0")]
[assembly: AssemblyFileVersion("1.1.0.0")]
[assembly: AssemblyInformationalVersion("1.1.0")]

internal static class BlockDeckLauncher
{
    [STAThread]
    private static void Main(string[] args)
    {
        string baseDir = AppDomain.CurrentDomain.BaseDirectory.TrimEnd(Path.DirectorySeparatorChar);
        string appExe = Path.Combine(baseDir, "BlockDeckApp.exe");
        if (!File.Exists(appExe))
        {
            appExe = Path.Combine(baseDir, "BlockDeck.exe");
        }

        var commandLine = new StringBuilder();
        if (Environment.GetEnvironmentVariable("BLOCKDECK_ENABLE_SANDBOX") != "1")
        {
            // Chromium's sandbox is unavailable in some remote/restricted Windows
            // sessions. Keep the launcher functional there; UI still runs with
            // context isolation and no Node.js integration in the renderer.
            commandLine.Append("--no-sandbox --disable-gpu-sandbox ");
        }

        foreach (string arg in args)
        {
            commandLine.Append(Quote(arg)).Append(' ');
        }

        var info = new ProcessStartInfo
        {
            FileName = appExe,
            Arguments = commandLine.ToString(),
            WorkingDirectory = baseDir,
            UseShellExecute = false,
            CreateNoWindow = true
        };
        // DSH/CI shells may export this; it would make Electron run in Node mode.
        info.EnvironmentVariables.Remove("ELECTRON_RUN_AS_NODE");
        info.EnvironmentVariables.Remove("ELECTRON_RUN_AS_NODE_OPTIONS");
        Process.Start(info);
    }

    private static string Quote(string value)
    {
        if (value.Length == 0) return "\"\"";
        if (value.IndexOf(' ') < 0 && value.IndexOf('\t') < 0 && value.IndexOf('"') < 0) return value;
        var builder = new StringBuilder("\"");
        foreach (char c in value)
        {
            if (c == '"') builder.Append('\\');
            builder.Append(c);
        }
        builder.Append('"');
        return builder.ToString();
    }
}
