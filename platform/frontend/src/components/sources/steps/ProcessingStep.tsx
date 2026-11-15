"use client"

import { Control, Controller } from "react-hook-form"
import { useTranslation } from "@/lib/hooks/use-translation"
import { FormSection } from "@/components/ui/form-section"
import { Checkbox } from "@/components/ui/checkbox"
import { SettingsResponse } from "@/lib/types/api"

interface CreateSourceFormData {
  type: 'link' | 'upload' | 'text'
  title?: string
  url?: string
  content?: string
  file?: FileList | File
  notebooks?: string[]
  embed: boolean
  async_processing: boolean
}

interface ProcessingStepProps {
  control: Control<CreateSourceFormData>
  settings?: SettingsResponse
}

export function ProcessingStep({
  control,
  settings
}: ProcessingStepProps) {
  const { t } = useTranslation()

  return (
    <div className="space-y-8">
      <FormSection
        title={t('navigation.settings')}
        description={t('sources.processDescription')}
      >
        <div className="space-y-4">
          {settings?.default_embedding_option === 'ask' && (
            <Controller
              control={control}
              name="embed"
              render={({ field }) => (
                <label 
                  htmlFor="enable-embedding"
                  className="flex items-start gap-3 cursor-pointer p-3 rounded-md hover:bg-muted"
                >
                  <Checkbox
                    id="enable-embedding"
                    checked={field.value}
                    onCheckedChange={field.onChange}
                    className="mt-0.5"
                  />
                  <div className="flex-1">
                    <span className="text-sm font-medium block">{t('sources.enableEmbedding')}</span>
                    <p className="text-xs text-muted-foreground mt-1">
                      {t('sources.embeddingDesc')}
                    </p>
                  </div>
                </label>
              )}
            />
          )}

          {settings?.default_embedding_option === 'always' && (
            <div className="p-3 rounded-md border border-border">
              <div className="flex items-start gap-3">
                <div className="w-2 h-2 bg-primary rounded-full mt-1.5 flex-shrink-0"></div>
                <div className="flex-1">
                  <span className="text-sm font-medium block text-foreground">{t('sources.embeddingAlways')}</span>
                  <p className="text-xs text-muted-foreground mt-1">
                    {t('sources.embeddingAlwaysDesc')}
                    {t('sources.changeInSettings')} <span className="font-medium">{t('navigation.settings')}</span>.
                  </p>
                </div>
              </div>
            </div>
          )}

          {settings?.default_embedding_option === 'never' && (
            <div className="p-3 rounded-md border border-border">
              <div className="flex items-start gap-3">
                <div className="w-2 h-2 bg-muted-foreground rounded-full mt-1.5 flex-shrink-0"></div>
                <div className="flex-1">
                  <span className="text-sm font-medium block text-foreground">{t('sources.embeddingNever')}</span>
                  <p className="text-xs text-muted-foreground mt-1">
                    {t('sources.embeddingNeverDesc')}
                    {t('sources.changeInSettings')} <span className="font-medium">{t('navigation.settings')}</span>.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </FormSection>
    </div>
  )
}
