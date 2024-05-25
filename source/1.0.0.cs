using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using Microsoft.Win32;
using System.Security.Principal;

class Program
{
    static void Main()
    {
        // 起動メッセージの表示
        ShowStartupMessage();

        if (!IsUserAdministrator())
        {
            Console.WriteLine("このプログラムは管理者権限で実行する必要があります。");
            Console.WriteLine("Press any key to exit...");
            Console.ReadKey();
            return;
        }

        var apps = GetInstalledApps();
        int currentIndex = 0;
        int offset = 0;
        int windowHeight = Console.WindowHeight - 1;

        while (true)
        {
            Console.Clear();
            for (int i = offset; i < offset + windowHeight && i < apps.Count; i++)
            {
                if (i == currentIndex)
                {
                    Console.BackgroundColor = ConsoleColor.Gray;
                    Console.ForegroundColor = ConsoleColor.Black;
                }

                Console.WriteLine($"{i + 1}: {apps[i].DisplayName}");
                Console.ResetColor();
            }

            var key = Console.ReadKey();

            if (key.Key == ConsoleKey.DownArrow)
            {
                if (currentIndex < apps.Count - 1)
                {
                    currentIndex++;
                    if (currentIndex >= offset + windowHeight)
                    {
                        offset++;
                    }
                }
            }
            else if (key.Key == ConsoleKey.UpArrow)
            {
                if (currentIndex > 0)
                {
                    currentIndex--;
                    if (currentIndex < offset)
                    {
                        offset--;
                    }
                }
            }
            else if (key.Key == ConsoleKey.Enter)
            {
                var selectedApp = apps[currentIndex];
                DisplayAppDetails(selectedApp);
                ShowDeleteConfirmation(selectedApp);

                Console.WriteLine("Press Y to delete, N to cancel");
                var confirm = Console.ReadKey();
                if (confirm.Key == ConsoleKey.Y)
                {
                    CloseAppProcesses(selectedApp.DisplayName);
                    DeleteFiles(selectedApp.InstallLocation);
                    DeleteRegistryKey($@"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\{selectedApp.RegistryKey}");
                    DeleteStartupShortcut(selectedApp.DisplayName);
                    DeleteStartMenuShortcut(selectedApp.DisplayName);
                    Console.WriteLine("App deleted successfully.");
                }
                else
                {
                    Console.WriteLine("Deletion cancelled.");
                }
                Console.WriteLine("Press any key to continue...");
                Console.ReadKey();
                break;
            }
        }
    }

    private static void ShowStartupMessage()
    {
        Console.Clear();
        Console.WriteLine("このプログラムは管理者権限で実行する必要があります。");
        Console.WriteLine("インストールされたプログラムの一覧を表示し、選択したプログラムを削除します。");
        Console.WriteLine("続行するには任意のキーを押してください...");
        Console.ReadKey();
    }

    private static bool IsUserAdministrator()
    {
        bool isAdmin;
        try
        {
            WindowsIdentity user = WindowsIdentity.GetCurrent();
            WindowsPrincipal principal = new WindowsPrincipal(user);
            isAdmin = principal.IsInRole(WindowsBuiltInRole.Administrator);
        }
        catch (UnauthorizedAccessException)
        {
            isAdmin = false;
        }
        catch (Exception)
        {
            isAdmin = false;
        }
        return isAdmin;
    }

    static List<Application> GetInstalledApps()
    {
        List<Application> apps = new List<Application>();
        string registryKeyPath = @"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall";
        using (RegistryKey key = Registry.LocalMachine.OpenSubKey(registryKeyPath))
        {
            foreach (string subkeyName in key.GetSubKeyNames())
            {
                using (RegistryKey subkey = key.OpenSubKey(subkeyName))
                {
                    var displayName = subkey.GetValue("DisplayName")?.ToString();
                    var installLocation = subkey.GetValue("InstallLocation")?.ToString();
                    if (!string.IsNullOrEmpty(displayName))
                    {
                        apps.Add(new Application
                        {
                            DisplayName = displayName,
                            InstallLocation = installLocation ?? "Not available",
                            RegistryKey = subkeyName
                        });
                    }
                }
            }
        }
        return apps;
    }

    static void DisplayAppDetails(Application app)
    {
        Console.Clear();
        Console.WriteLine($"Selected App: {app.DisplayName}");
        Console.WriteLine($"Install Location: {app.InstallLocation}");
        Console.WriteLine($"Registry Key: {app.RegistryKey}");
    }

    static void ShowDeleteConfirmation(Application app)
    {
        Console.WriteLine("\n以下の項目が削除されます:");
        if (app.InstallLocation != "Not available" && Directory.Exists(app.InstallLocation))
        {
            Console.WriteLine($"- ファイルとフォルダ: {app.InstallLocation}");
            List<string> files = GetFilesAndFolders(app.InstallLocation);
            foreach (var file in files)
            {
                Console.WriteLine(file);
            }
        }
        Console.WriteLine($"- レジストリキー: {app.RegistryKey}");
        Console.WriteLine($"- スタートアップショートカット: {Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Startup), $"{app.DisplayName}.lnk")}");
        Console.WriteLine($"- スタートメニューショートカット: {Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.StartMenu), $"{app.DisplayName}.lnk")}");
    }

    static List<string> GetFilesAndFolders(string path)
    {
        List<string> files = new List<string>();
        try
        {
            foreach (var file in Directory.GetFiles(path))
            {
                files.Add(file);
            }
            foreach (var directory in Directory.GetDirectories(path))
            {
                files.Add(directory);
                files.AddRange(GetFilesAndFolders(directory)); // 再帰的に取得
            }
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Failed to list files and folders at {path}: {ex.Message}");
        }
        return files;
    }

    static void CloseAppProcesses(string appName)
    {
        foreach (var process in Process.GetProcesses())
        {
            try
            {
                if (process.MainWindowTitle.Contains(appName) || process.ProcessName.Contains(appName))
                {
                    process.Kill();
                    Console.WriteLine($"Process {process.ProcessName} has been closed.");
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Failed to close {process.ProcessName}: {ex.Message}");
            }
        }
    }

    static void DeleteFiles(string path)
    {
        if (Directory.Exists(path))
        {
            try
            {
                Directory.Delete(path, true);
                Console.WriteLine($"Deleted files and folders at {path}");
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Failed to delete files and folders at {path}: {ex.Message}");
            }
        }
    }

    static void DeleteRegistryKey(string keyPath)
    {
        try
        {
            using (RegistryKey key = Registry.LocalMachine.OpenSubKey(keyPath, writable: true))
            {
                if (key != null)
                {
                    key.DeleteSubKeyTree("");
                    Console.WriteLine($"Deleted registry key {keyPath}");
                }
            }
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Failed to delete registry key {keyPath}: {ex.Message}");
        }
    }

    static void DeleteStartupShortcut(string appName)
    {
        string startupPath = Environment.GetFolderPath(Environment.SpecialFolder.Startup);
        string shortcutPath = Path.Combine(startupPath, $"{appName}.lnk");
        if (File.Exists(shortcutPath))
        {
            try
            {
                File.Delete(shortcutPath);
                Console.WriteLine($"Deleted startup shortcut {shortcutPath}");
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Failed to delete startup shortcut {shortcutPath}: {ex.Message}");
            }
        }
    }

    static void DeleteStartMenuShortcut(string appName)
    {
        string startMenuPath = Environment.GetFolderPath(Environment.SpecialFolder.StartMenu);
        string shortcutPath = Path.Combine(startMenuPath, $"{appName}.lnk");
        if (File.Exists(shortcutPath))
        {
            try
            {
                File.Delete(shortcutPath);
                Console.WriteLine($"Deleted start menu shortcut {shortcutPath}");
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Failed to delete start menu shortcut {shortcutPath}: {ex.Message}");
            }
        }
    }
}

class Application
{
    public string DisplayName { get; set; }
    public string InstallLocation { get; set; }
    public string RegistryKey { get; set; }
}
