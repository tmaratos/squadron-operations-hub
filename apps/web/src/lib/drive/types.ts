export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime?: string;
  createdTime?: string;
  webViewLink?: string;
  webContentLink?: string;
  size?: string;
  parents?: string[];
  iconLink?: string;
}

export interface DriveFileList {
  files: DriveFile[];
  nextPageToken?: string;
}
