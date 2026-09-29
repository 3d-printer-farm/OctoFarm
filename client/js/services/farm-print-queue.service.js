import OctoFarmClient from "./octofarm-client.service";
import UI from "../utils/ui.js";

// A slicer (OrcaSlicer's Print Host, for example) doesn't know about individual
// printers on the farm - it just uploads to OctoFarm like it would to a single
// OctoPrint instance. When that happens we ask the operator, via this popup, which
// printer(s) on the farm should actually receive the file.
function buildPrinterCheckboxList(printers) {
  return printers
    .map(
      (printer) => `
      <div class="custom-control custom-checkbox mb-1">
        <input type="checkbox" class="custom-control-input farmPrintPrinterOption" id="farmPrintPrinter-${printer._id}" value="${printer._id}">
        <label class="custom-control-label" for="farmPrintPrinter-${printer._id}">${printer.printerName}</label>
      </div>`
    )
    .join("");
}

export async function showFarmPrintRequestModal({ jobId, fileName, print }) {
  let printers = [];
  try {
    printers = await OctoFarmClient.listPrinters();
  } catch (e) {
    UI.createAlert("error", "Could not load printer list for the incoming file.", 3000, "clicked");
    return;
  }

  if (!printers.length) {
    UI.createAlert(
      "warning",
      `Received "${fileName}" but no printers are registered on the farm yet.`,
      5000,
      "clicked"
    );
    return;
  }

  bootbox.dialog({
    title: print
      ? `Print request received: ${fileName}`
      : `File received: ${fileName}`,
    message: `
      <p>${
        print
          ? "A slicer asked to print this file. Choose which printer(s) on the farm should print it:"
          : "A slicer uploaded this file. Choose which printer(s) on the farm should receive it:"
      }</p>
      <div id="farmPrintPrinterList">${buildPrinterCheckboxList(printers)}</div>
    `,
    buttons: {
      cancel: {
        label: "Discard",
        className: "btn-danger",
        callback: async () => {
          await OctoFarmClient.delete(`api/farm-print-queue/${jobId}`);
        }
      },
      confirm: {
        label: print ? "Print" : "Upload",
        className: "btn-success",
        callback: async () => {
          const selected = Array.from(
            document.querySelectorAll(".farmPrintPrinterOption:checked")
          ).map((el) => el.value);

          if (!selected.length) {
            UI.createAlert("warning", "Select at least one printer.", 3000, "clicked");
            return false; // Keep dialog open
          }

          try {
            await OctoFarmClient.post(`api/farm-print-queue/${jobId}/dispatch`, {
              printerIds: selected
            });
            UI.createAlert(
              "success",
              `Sent "${fileName}" to ${selected.length} printer(s).`,
              4000,
              "clicked"
            );
          } catch (e) {
            UI.createAlert(
              "error",
              `Failed to send "${fileName}" to the selected printer(s).`,
              4000,
              "clicked"
            );
          }
        }
      }
    }
  });
}
