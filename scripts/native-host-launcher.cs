using System;
using System.Diagnostics;
using System.IO;
using System.Threading.Tasks;

internal static class NativeHostLauncher
{
    private const string NodePathFile = "node-path.txt";
    private const string HostScriptFile = "native-host.cjs";

    public static int Main()
    {
        try
        {
            string directory = Path.GetDirectoryName(Process.GetCurrentProcess().MainModule.FileName);
            string nodePathFile = Path.Combine(directory, NodePathFile);
            string hostScript = Path.Combine(directory, HostScriptFile);
            if (!File.Exists(nodePathFile)) throw new FileNotFoundException("Node.js path file is missing.", nodePathFile);
            if (!File.Exists(hostScript)) throw new FileNotFoundException("Native Host script is missing.", hostScript);

            string nodePath = File.ReadAllText(nodePathFile).Trim();
            if (nodePath.Length == 0 || !File.Exists(nodePath)) throw new FileNotFoundException("Configured Node.js executable is unavailable.", nodePath);

            ProcessStartInfo start = new ProcessStartInfo();
            start.FileName = nodePath;
            start.Arguments = Quote(hostScript);
            start.UseShellExecute = false;
            start.CreateNoWindow = true;
            start.RedirectStandardInput = true;
            start.RedirectStandardOutput = true;
            start.RedirectStandardError = true;

            using (Process child = new Process())
            {
                child.StartInfo = start;
                if (!child.Start()) throw new InvalidOperationException("Node.js Native Host did not start.");

                Task input = Task.Run(delegate
                {
                    try { Pump(Console.OpenStandardInput(), child.StandardInput.BaseStream, true); }
                    catch { }
                });
                Task output = Task.Run(delegate { Pump(child.StandardOutput.BaseStream, Console.OpenStandardOutput(), false); });
                Task error = Task.Run(delegate { Pump(child.StandardError.BaseStream, Console.OpenStandardError(), false); });

                child.WaitForExit();
                try { child.StandardInput.Close(); } catch { }
                Task.WaitAll(new Task[] { output, error }, 5000);
                GC.KeepAlive(input);
                return child.ExitCode;
            }
        }
        catch (Exception error)
        {
            Console.Error.WriteLine("[lingee-native-host-launcher] " + error.Message);
            return 1;
        }
    }

    private static void Pump(Stream source, Stream destination, bool closeDestination)
    {
        byte[] buffer = new byte[81920];
        try
        {
            int read;
            while ((read = source.Read(buffer, 0, buffer.Length)) > 0)
            {
                destination.Write(buffer, 0, read);
                destination.Flush();
            }
        }
        finally
        {
            if (closeDestination) destination.Close();
        }
    }

    private static string Quote(string value)
    {
        return "\"" + value.Replace("\"", "\\\"") + "\"";
    }
}
