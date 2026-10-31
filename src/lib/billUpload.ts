import {
  INTAKE_LIVE_MAX_BYTES,
  uploadIntake,
  type IntakeDto,
  type IntakeSourceDto,
} from '../api/expenditure/billIntake'
import { ApiError } from '../api/errors'
import { describeApiFailure } from './apiFailure'
import { UPLOAD_MAY_HAVE_ARRIVED, UPLOAD_REFUSALS, uploadMayHaveArrived } from './billIntake'
import type { FormMessage } from './identity/errors'
import { shrinkSlip } from './posSlip'

/** Room left for the multipart wrapping around the file. */
const WRAPPING_BYTES = 16 * 1024

/**
 * A photo the server would refuse for size goes up shrunk, by the till slip's helper; anything else
 * goes as it is. The original stays when shrinking does not help.
 */
export async function fitForUpload(file: File): Promise<File> {
  if (file.size <= INTAKE_LIVE_MAX_BYTES - WRAPPING_BYTES) return file
  const { blob, name } = await shrinkSlip(file)
  return blob !== file && blob.size < file.size ? new File([blob], name, { type: blob.type }) : file
}

/** The edge refused the body for size, before the server's own coded answer could speak. */
export function refusedForSize(error: unknown): boolean {
  return error instanceof ApiError && error.status === 413 && !error.code
}

export const TOO_BIG_FOR_SERVER = 'billIntake.upload.tooBigForServer'

function refusalOf(error: unknown): FormMessage {
  if (error instanceof ApiError && error.code && Object.hasOwn(UPLOAD_REFUSALS, error.code)) {
    return { key: UPLOAD_REFUSALS[error.code] }
  }
  if (uploadMayHaveArrived(error)) return { key: UPLOAD_MAY_HAVE_ARRIVED }
  return describeApiFailure(error)
}

export type UploadedFile = { intake: IntakeDto; file: File; readSeconds: number }

/**
 * Sends the files one after another and accounts for every one. A file too big for the server is
 * named and the rest still go. Any other failure stops the run, as a retry would meet it too, and
 * the files that were not stored are named.
 */
export async function uploadInTurn(
  files: File[],
  source: IntakeSourceDto,
  onFile?: (file: File, index: number) => void,
): Promise<{ uploaded: UploadedFile[]; problems: FormMessage[] }> {
  const uploaded: UploadedFile[] = []
  const problems: FormMessage[] = []
  for (const [index, original] of files.entries()) {
    onFile?.(original, index)
    const file = await fitForUpload(original)
    const started = performance.now()
    try {
      const intake = await uploadIntake(file, source)
      uploaded.push({ intake, file, readSeconds: (performance.now() - started) / 1000 })
    } catch (error) {
      if (refusedForSize(error)) {
        problems.push({ key: TOO_BIG_FOR_SERVER, values: { name: original.name } })
        continue
      }
      problems.push(refusalOf(error))
      if (files.length > 1) {
        const names = files
          .slice(index)
          .map((entry) => entry.name)
          .join(', ')
        problems.push({ key: 'billIntake.upload.notAdded', values: { names } })
      }
      break
    }
  }
  return { uploaded, problems }
}
