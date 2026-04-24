package main

import (
	"embed"
	"os/exec"

	"github.com/getlantern/systray"
)

//go:embed static
var static embed.FS

func main() {
	systray.Run(onReady, nil)
}

func onReady() {
	icon, _ := static.ReadFile("static/favicon.ico")
	systray.SetIcon(icon)
	systray.SetTooltip("GoAPI :8080")

	mOpen := systray.AddMenuItem("Abrir en browser", "http://localhost:8080")
	systray.AddSeparator()
	mQuit := systray.AddMenuItem("Salir", "")

	go startServer()

	go func() {
		for {
			select {
			case <-mOpen.ClickedCh:
				exec.Command("cmd", "/c", "start", "http://localhost:8080").Start()
			case <-mQuit.ClickedCh:
				systray.Quit()
			}
		}
	}()
}
