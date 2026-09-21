import type {MetadataRoute} from 'next'
import {siteUrl} from '@/lib/site-url'
export default function sitemap():MetadataRoute.Sitemap{const base=siteUrl();if(base.protocol!=='https:')return [];return ['','/privacy','/terms','/cookies','/refunds'].map(path=>({url:new URL(path||'/',base.origin).href,lastModified:'2026-09-21',changeFrequency:'monthly' as const}))}
