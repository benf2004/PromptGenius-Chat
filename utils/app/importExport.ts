import Zip from 'adm-zip';

import { Conversation } from '@/types/chat';
import {
  ConversationV1,
  ConversationV4,
  ConversationV5,
  ExportFormatsV2AndUp,
  ExportFormatV1,
  ExportFormatV2,
  ExportFormatV3,
  ExportFormatV4,
  ExportFormatV5,
  LatestExportFormat,
  SupportedExportFormats,
} from '@/types/export';

import {
  cleanHistoryItem,
  convertV1HistoryToV2History,
  convertV1ToV2,
  convertV2ToV3,
  convertV3ToV4,
  convertV4ToV5,
  isHistoryFormatV1,
} from './clean';

import { FolderInterface } from '@/types/folder';
import { Prompt } from '@/types/prompt';

import { cleanConversationHistory } from './clean';


export function isExportFormatV1(obj: any): obj is ExportFormatV1 {
  return Array.isArray(obj);
}

export function isExportFormatV2(obj: any): obj is ExportFormatV2 {
  return !('version' in obj) && 'folders' in obj && 'history' in obj;
}

export function isExportFormatV3(obj: any): obj is ExportFormatV3 {
  return obj.version === 3;
}

export function isExportFormatV4(obj: any): obj is ExportFormatV4 {
  return obj.version === 4;
}

export function isExportFormatV5(obj: any): obj is ExportFormatV5 {
  return obj.version === 5;
}

export const isLatestExportFormat = isExportFormatV5;

export function cleanData(data: SupportedExportFormats): LatestExportFormat {
  let originalDataFormat: string | null = null;

  const convertData = (
    versionNumber: string,
    isData: (obj: any) => boolean,
    convertData?: (obj: any) => any,
  ) => {
    if (isData(data)) {
      if (!originalDataFormat) {
        originalDataFormat = versionNumber;
      }
      if (convertData) {
        data = convertData(data);
      }
    }
  };

  // Convert data between formats
  convertData('1', isExportFormatV1, convertV1ToV2);
  convertData('2', isExportFormatV2, convertV2ToV3);
  convertData('3', isExportFormatV3, convertV3ToV4);
  convertData('4', isExportFormatV4, convertV4ToV5);
  convertData('5', isExportFormatV5);

  if (!originalDataFormat) {
    throw new Error('Unsupported data format');
  } else {
    return data as LatestExportFormat;
  }

}

function createFilename(kind: string, extension: string): string {
  const currentDate = new Date();
  const year = currentDate.getFullYear();
  const month = String(currentDate.getMonth() + 1).padStart(2, '0');
  const day = String(currentDate.getDate()).padStart(2, '0');
  return `chatbot_ui_export_${year}${month}${day}_${kind}.${extension}`;
}

// replace common problematic filename characters
function sanitizeFilename(filename: string): string {
  const regex = /[\/\\:\*\?"<>\|]+/g;
  return filename.replace(regex, '_');
}

export const exportMarkdown = () => {
  const conversationsString = localStorage.getItem('conversationHistory');
  const conversations: Conversation[] = conversationsString ? JSON.parse(conversationsString) as Conversation[] : [];
  const foldersString = localStorage.getItem('folders');
  const folders: FolderInterface[] = foldersString ? JSON.parse(foldersString) as FolderInterface[] : [];
  const zip = new Zip();

  // add folders as directories
  if (folders) {
    for (const folder of folders) {
      zip.addFile(`${sanitizeFilename(folder.name)}/`, Buffer.from([]));
    }
  }

// Filter "chat" type folders and create an object with ids as keys and names as values
  const chatFolderNames: { [id: string]: string } = folders
    .filter((folder) => folder.type === "chat")
    .reduce((accumulator: { [id: string]: string }, folder) => {
      accumulator[folder.id] = sanitizeFilename(folder.name);
      return accumulator;
    }, {});

  // add conversations as Markdown files
  if (conversations) {
    for (const conversation of conversations) {
      let markdownContent = '';
      for (const message of conversation.messages) {
	markdownContent += `## ${message.role.charAt(0).toUpperCase() + message.role.slice(1)}\n\n${message.content}\n\n`;
      }
      const folderId = conversation.folderId ?? '';
      const directory = folderId in chatFolderNames ? chatFolderNames[folderId] : '';
      const filename = `${sanitizeFilename(conversation.name)}.md`
      zip.addFile(directory + '/' + filename, Buffer.from(markdownContent));
    }
  }

  const zipDownload = zip.toBuffer();
  const url = URL.createObjectURL(new Blob([zipDownload]));
  const link = document.createElement('a');
  link.download = createFilename('markdown', 'zip')
  link.href = url;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

export const exportData = () => {
  let history = localStorage.getItem('conversationHistory');
  let folders = localStorage.getItem('folders');
  let prompts = localStorage.getItem('prompts');

  if (history) {
    history = JSON.parse(history);
  }

  if (folders) {
    folders = JSON.parse(folders);
  }

  if (prompts) {
    prompts = JSON.parse(prompts);
  }

  const data = {
    version: 5,
    history: history || [],
    folders: folders || [],
    prompts: prompts || [],
  } as LatestExportFormat;

  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.download = createFilename('data', 'json')
  link.href = url;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

export const importData = (
  data: SupportedExportFormats,
): LatestExportFormat => {
  const cleanedData = cleanData(data);
  const { history, folders, prompts } = cleanedData;

  const oldConversations = localStorage.getItem('conversationHistory');
  const oldConversationsParsed = oldConversations
    ? JSON.parse(oldConversations)
    : [];

  const newHistory: Conversation[] = [
    ...oldConversationsParsed,
    ...history,
  ].filter(
    (conversation, index, self) =>
      index === self.findIndex((c) => c.id === conversation.id),
  );
  localStorage.setItem('conversationHistory', JSON.stringify(newHistory));
  if (newHistory.length > 0) {
    localStorage.setItem(
      'selectedConversation',
      JSON.stringify(newHistory[newHistory.length - 1]),
    );
  } else {
    localStorage.removeItem('selectedConversation');
  }

  const oldFolders = localStorage.getItem('folders');
  const oldFoldersParsed = oldFolders ? JSON.parse(oldFolders) : [];
  const newFolders: FolderInterface[] = [
    ...oldFoldersParsed,
    ...folders,
  ].filter(
    (folder, index, self) =>
      index === self.findIndex((f) => f.id === folder.id),
  );
  localStorage.setItem('folders', JSON.stringify(newFolders));

  const oldPrompts = localStorage.getItem('prompts');
  const oldPromptsParsed = oldPrompts ? JSON.parse(oldPrompts) : [];
  const newPrompts: Prompt[] = [...oldPromptsParsed, ...prompts].filter(
    (prompt, index, self) =>
      index === self.findIndex((p) => p.id === prompt.id),
  );
  localStorage.setItem('prompts', JSON.stringify(newPrompts));

  return cleanedData
};
