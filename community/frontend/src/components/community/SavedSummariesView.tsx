'use client'

import { useEffect, useState } from 'react'
import { Bookmark, Folder, Plus, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@siet/platform/components/ui/skeleton'
import type { CommunityPost, SavedCollection, Wallet } from '@siet/platform/lib/api/community'
import { PostCard } from '@siet/community/components/community/PostCard'

interface SavedSummariesViewProps {
  posts: CommunityPost[]
  collections: SavedCollection[]
  collectionId: number | null
  savedCount: number
  wallet?: Wallet
  isLoading: boolean
  isError: boolean
  hasNextPage: boolean
  isFetchingNextPage: boolean
  isCreatingCollection: boolean
  isGeneratingQuiz: boolean
  createOpen: boolean
  onSelectCollection: (id: number | null) => void
  onCreateOpenChange: (open: boolean) => void
  onCreateCollection: (name: string) => void
  onAddToCollection: (postId: number, collectionId: number) => void
  onLoadMore: () => void
  onGenerateQuiz: () => void
}

export function SavedSummariesView({
  posts,
  collections,
  collectionId,
  savedCount,
  wallet,
  isLoading,
  isError,
  hasNextPage,
  isFetchingNextPage,
  isCreatingCollection,
  isGeneratingQuiz,
  createOpen,
  onSelectCollection,
  onCreateOpenChange,
  onCreateCollection,
  onAddToCollection,
  onLoadMore,
  onGenerateQuiz,
}: SavedSummariesViewProps) {
  const [collectionName, setCollectionName] = useState('')

  useEffect(() => {
    if (!createOpen) setCollectionName('')
  }, [createOpen])

  const submitCollection = () => {
    const name = collectionName.trim()
    if (!name || isCreatingCollection) return
    onCreateCollection(name)
  }

  const selectedCollection = collections.find((collection) => collection.id === collectionId)
  const cost = wallet?.rules.costs.quiz_generate ?? 8
  const balance = wallet?.balance ?? 0
  const remaining = wallet?.exempt ? balance : Math.max(0, balance - cost)

  return (
    <>
      <div className="space-y-4">
        <div className="space-y-1">
          <h1 className="text-lg font-semibold tracking-tight">สรุปที่บันทึกไว้</h1>
          <p className="text-xs text-muted-foreground">
            สรุปและโน้ตที่คุณบันทึกไว้ รวมไว้ในที่เดียว
          </p>
        </div>

        <div className="no-scrollbar flex items-center gap-2 overflow-x-auto pb-1">
          <Button
            size="sm"
            variant={collectionId === null ? 'default' : 'outline'}
            className={`shrink-0 rounded-full ${collectionId === null ? 'bg-pink-600 text-white hover:bg-pink-700' : 'border-pink-100'}`}
            onClick={() => onSelectCollection(null)}
          >
            ทั้งหมดที่บันทึก
          </Button>
          {collections.map((collection) => (
            <Button
              key={collection.id}
              size="sm"
              variant={collection.id === collectionId ? 'default' : 'outline'}
              className={`shrink-0 rounded-full ${collection.id === collectionId ? 'bg-pink-600 text-white hover:bg-pink-700' : 'border-pink-100'}`}
              onClick={() => onSelectCollection(collection.id)}
            >
              {collection.name}
            </Button>
          ))}
          <Button
            size="sm"
            variant="outline"
            className="shrink-0 gap-1 rounded-full border-pink-200 text-pink-700 hover:bg-pink-50"
            onClick={() => onCreateOpenChange(true)}
          >
            <Plus className="h-3.5 w-3.5" /> คลังใหม่
          </Button>
        </div>

        <div className="flex items-center justify-between px-1">
          <p className="text-xs font-medium text-muted-foreground">
            {selectedCollection
              ? `${selectedCollection.item_count} โพสต์ใน “${selectedCollection.name}”`
              : `${savedCount} โพสต์ที่บันทึกไว้`}
          </p>
          <span className="rounded-full border border-pink-100 bg-white px-3 py-1 text-xs text-muted-foreground">
            ล่าสุดที่บันทึก
          </span>
        </div>

        {isLoading && (
          <div className="space-y-4">
            <Skeleton className="h-48 w-full rounded-2xl" />
            <Skeleton className="h-48 w-full rounded-2xl" />
          </div>
        )}
        {isError && (
          <Card className="rounded-2xl">
            <CardContent className="p-8 text-center text-sm text-muted-foreground">
              โหลดรายการที่บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง
            </CardContent>
          </Card>
        )}
        {!isLoading && !isError && posts.length === 0 && (
          <Card className="rounded-2xl">
            <CardContent className="flex flex-col items-center gap-2 p-10 text-center text-sm text-muted-foreground">
              <Bookmark className="h-8 w-8" />
              {selectedCollection
                ? 'คลังนี้ยังไม่มีโพสต์'
                : 'ยังไม่มีโพสต์ที่บันทึกไว้ กด “บันทึก” บนโพสต์ที่ต้องการเก็บไว้อ่านภายหลัง'}
            </CardContent>
          </Card>
        )}
        {posts.map((post) => (
          <PostCard
            key={post.id}
            post={post}
            savedView
            savedCollections={collections}
            onAddToSavedCollection={onAddToCollection}
          />
        ))}
        {hasNextPage && (
          <div className="flex justify-center">
            <Button variant="outline" disabled={isFetchingNextPage} onClick={onLoadMore}>
              {isFetchingNextPage ? 'กำลังโหลด…' : 'โหลดโพสต์เพิ่ม'}
            </Button>
          </div>
        )}

        <div className="lg:hidden">
          <SavedSummaryTools
            collections={collections}
            collectionId={collectionId}
            savedCount={savedCount}
            balance={balance}
            cost={cost}
            exempt={wallet?.exempt ?? false}
            remaining={remaining}
            isGenerating={isGeneratingQuiz}
            onSelectCollection={onSelectCollection}
            onCreateCollection={() => onCreateOpenChange(true)}
            onGenerateQuiz={onGenerateQuiz}
          />
        </div>
      </div>

      <Dialog
        open={createOpen}
        onOpenChange={(open) => {
          onCreateOpenChange(open)
          if (!open) setCollectionName('')
        }}
      >
        <DialogContent className="community-theme sm:max-w-md">
          <DialogHeader>
            <DialogTitle>สร้างคลังที่บันทึกไว้</DialogTitle>
          </DialogHeader>
          <Input
            autoFocus
            value={collectionName}
            onChange={(event) => setCollectionName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') submitCollection()
            }}
            maxLength={80}
            placeholder="เช่น เตรียมสอบ, แคลคูลัส 1"
          />
          <DialogFooter>
            <Button
              disabled={!collectionName.trim() || isCreatingCollection}
              onClick={submitCollection}
              className="bg-pink-600 text-white hover:bg-pink-700"
            >
              {isCreatingCollection ? 'กำลังสร้าง…' : 'สร้างคลัง'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

export function SavedSummaryTools({
  collections,
  collectionId,
  savedCount,
  balance,
  cost,
  exempt,
  remaining,
  isGenerating,
  onSelectCollection,
  onCreateCollection,
  onGenerateQuiz,
}: {
  collections: SavedCollection[]
  collectionId: number | null
  savedCount: number
  balance: number
  cost: number
  exempt: boolean
  remaining: number
  isGenerating: boolean
  onSelectCollection: (id: number | null) => void
  onCreateCollection: () => void
  onGenerateQuiz: () => void
}) {
  return (
    <div className="space-y-4">
      <Card className="rounded-2xl border-pink-100 bg-white shadow-sm dark:bg-card">
        <CardContent className="space-y-3 p-4">
          <div>
            <h2 className="text-sm font-semibold">คลังที่บันทึกไว้</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {collections.length} คลังส่วนตัว
            </p>
          </div>
          {collections.length === 0 ? (
            <p className="rounded-xl bg-pink-50 p-3 text-xs text-muted-foreground">
              สร้างคลังเพื่อจัดกลุ่มโพสต์ที่บันทึกไว้
            </p>
          ) : (
            <div className="space-y-2">
              {collections.map((collection) => (
                <button
                  key={collection.id}
                  type="button"
                  onClick={() => onSelectCollection(collection.id)}
                  className={`flex w-full items-center gap-2 rounded-xl border p-2.5 text-left transition-colors ${
                    collection.id === collectionId
                      ? 'border-pink-200 bg-pink-50'
                      : 'border-transparent bg-pink-50/70 hover:border-pink-100'
                  }`}
                >
                  <Folder className="h-4 w-4 shrink-0 text-pink-600" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-semibold">{collection.name}</span>
                    <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                      {collection.course_names || 'รายการส่วนตัว'}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {collection.item_count} รายการ
                  </span>
                </button>
              ))}
            </div>
          )}
          <Button
            variant="outline"
            onClick={onCreateCollection}
            className="w-full rounded-full border-pink-100 text-xs text-pink-700 hover:bg-pink-50"
          >
            <Plus className="mr-1 h-3.5 w-3.5" /> สร้างคลังใหม่
          </Button>
        </CardContent>
      </Card>

      <Card className="rounded-2xl border-pink-100 bg-white shadow-sm dark:bg-card">
        <CardContent className="space-y-3 p-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Sparkles className="h-4 w-4 text-pink-600" /> แบบทดสอบ AI
          </h2>
          <div className="rounded-xl bg-pink-50 p-3 dark:bg-pink-950/20">
            <p className="text-xs font-semibold">ทดสอบความรู้ที่คุณบันทึกไว้</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              สร้างแบบทดสอบจาก {savedCount} โพสต์ที่บันทึกไว้
              {collectionId !== null ? 'ในคลังที่เลือก' : ''} เพื่อทบทวนเนื้อหา
            </p>
          </div>
          <Button
            disabled={savedCount === 0 || isGenerating}
            onClick={onGenerateQuiz}
            className="w-full rounded-xl bg-pink-600 px-3 py-3 text-xs text-white hover:bg-pink-700"
          >
            {isGenerating
              ? 'กำลังสร้างแบบทดสอบ…'
              : `สร้างแบบทดสอบ AI จากโน้ตที่บันทึกไว้ - ${exempt ? 'ฟรี' : `${cost} เครดิต`}`}
          </Button>
          <p className="text-xs text-muted-foreground">
            เครดิตที่มี: {exempt ? 'ไม่จำกัด' : balance}
            {' · หลังสร้าง: '}
            {exempt ? 'ไม่จำกัด' : remaining}
          </p>
          <p className="text-xs leading-relaxed text-muted-foreground">
            AI อาจสร้างคำถามคลาดเคลื่อน กรุณาตรวจทานก่อนนำไปใช้งาน
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
