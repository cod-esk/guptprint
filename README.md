# GuptPrint Printer Agent

Local CUPS bridge for one shop PC/Raspberry Pi. See the root [README](../README.md) for install and the cloud contract.

This process never listens on a public port. It polls GuptPrint, prints exactly one claimed job at a time and deletes the temporary PDF regardless of result. Keep `config.json` local and never commit it.
