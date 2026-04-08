
declare module "*.jpg" {
  const value: any;
  export = value;
}

declare module "*.jpeg" {
  const value: any;
  export = value;
}

declare module "*.png" {
  const value: any;
  export = value;
}

declare module "*.gif" {
  const value: any;
  export = value;
}

declare module "*.svg" {
  const value: any;
  export = value;
}

declare module "*.webp" {
  const value: any;
  export = value;
}

declare module "*.bmp" {
  const value: any;
  export = value;
}

declare module '*.xml' {
  const value: any;
  export default value;
}

export interface Channel {
  tvgId: string | null;
  name: string;
  url: string;
  group: string;
  logo?: string;
  license_type: string;
  license_key: string | null;
  userAgent: string;
  referrer: string | null;
}

interface Programme {
  start: string;
  stop: string;
  title: string;
}