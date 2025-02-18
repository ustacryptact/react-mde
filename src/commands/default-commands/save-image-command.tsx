import {
  Command,
  CommandContext,
  ExecuteOptions,
  PasteCommandContext,
  PasteOptions
} from "../command";
import { readFileAsync } from "../../util/files";
import { getBreaksNeededForEmptyLineBefore } from "../../util/MarkdownUtil";

function dataTransferToArray(items: DataTransferItemList): Array<File> {
  const result = [];
  for (const index in items) {
    const item = items[index];
    if (item.kind === "file") {
      result.push(item.getAsFile());
    }
  }
  return result;
}

function fileListToArray(list: FileList): Array<File> {
  const result = [];
  for (var i = 0; i < list.length; i++) {
    result.push(list[0]);
  }
  return result;
}

function filterItems(
  items: File[],
  { multiple, accept }: Pick<PasteOptions, "multiple" | "accept">
): File[] {
  let filteredItems = items;

  if (!multiple) {
    filteredItems = filteredItems.slice(0, 1);
  }

  if (accept) {
    //https://developer.mozilla.org/en-US/docs/Web/HTML/Element/input/file#unique_file_type_specifiers
    const acceptedTypes = accept.split(",");
    const fileExtensions = new Set(
      acceptedTypes.filter(t => /^\.\w+/.test(t)).map(t => t.split(".")[1])
    );
    const mimeTypes = new Set(
      acceptedTypes.filter(t => /^[-\w.]+\/[-\w.]+$/.test(t))
    );
    const anyTypes = new Set(
      acceptedTypes
        .filter(t => /(audio|video|image)\/\*/.test(t))
        .map(t => t.split("/")[0])
    );

    filteredItems = filteredItems.filter(
      f =>
        fileExtensions.has(f.name.split(".")[1]) ||
        mimeTypes.has(f.type) ||
        anyTypes.has(f.type.split("/")[0])
    );
  }

  return filteredItems;
}

export const saveImageCommand: Command = {
  async execute({
    initialState,
    textApi,
    context,
    l18n
  }: ExecuteOptions): Promise<void> {
    if (!context) {
      throw new Error("wrong context");
    }
    const pasteContext = context as PasteCommandContext;
    const {
      event,
      pasteOptions: { saveImage, multiple, accept }
    } = pasteContext;

    const items = isPasteEvent(context)
      ? dataTransferToArray((event as React.ClipboardEvent).clipboardData.items)
      : isDragEvent(context)
      ? dataTransferToArray((event as React.DragEvent).dataTransfer.items)
      : fileListToArray(
          (event as React.ChangeEvent<HTMLInputElement>).target.files
        );

    const filteredItems = filterItems(items, { multiple, accept });

    for (const index in filteredItems) {
      const initialState = textApi.getState();
      const breaksBeforeCount = getBreaksNeededForEmptyLineBefore(
        initialState.text,
        initialState.selection.start
      );

      const breaksBefore = Array(breaksBeforeCount + 1).join("\n");
      const placeHolder = `${breaksBefore}![${l18n.uploadingImage}]()`;

      textApi.replaceSelection(placeHolder);

      const blob = items[index];
      const blobContents = await readFileAsync(blob);
      const savingImage = saveImage(blobContents);
      const imageUrl = (await savingImage.next()).value;

      const newState = textApi.getState();

      const uploadingText = newState.text.substr(
        initialState.selection.start,
        placeHolder.length
      );

      if (uploadingText === placeHolder) {
        // In this case, the user did not touch the placeholder. Good user
        // we will replace it with the real one that came from the server
        textApi.setSelectionRange({
          start: initialState.selection.start,
          end: initialState.selection.start + placeHolder.length
        });

        const realImageMarkdown = imageUrl
          ? `${breaksBefore}![image](${imageUrl})`
          : "";
        const selectionDelta = realImageMarkdown.length - placeHolder.length;

        textApi.replaceSelection(realImageMarkdown);
        textApi.setSelectionRange({
          start: newState.selection.start + selectionDelta,
          end: newState.selection.end + selectionDelta
        });
      }
    }
  }
};

function isPasteEvent(context: CommandContext): context is PasteCommandContext {
  return (
    ((context as PasteCommandContext).event as React.ClipboardEvent)
      .clipboardData !== undefined
  );
}

function isDragEvent(context: CommandContext): context is PasteCommandContext {
  return (
    ((context as PasteCommandContext).event as React.DragEvent).dataTransfer !==
    undefined
  );
}
