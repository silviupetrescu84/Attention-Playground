/**
 * Images drawn on the canvas, shared by every minigame. A canvas cannot draw
 * an image until it has loaded, so games load theirs before a round starts.
 */

/**
 * A loader for the image at `url`: the first call downloads it, later calls
 * get the same image. If it fails to load, the next call tries again.
 * `name` is for the error message.
 */
export function createImageLoader(url: string, name: string): () => Promise<HTMLImageElement> {
  let loading: Promise<HTMLImageElement> | undefined

  return () => {
    if (!loading) {
      loading = new Promise<HTMLImageElement>((resolve, reject) => {
        const image = new Image()
        image.addEventListener('load', () => resolve(image), { once: true })
        image.addEventListener('error', () => reject(new Error(`Could not load ${name}`)), {
          once: true,
        })
        image.src = url
      }).catch((error: unknown) => {
        loading = undefined
        throw error
      })
    }

    return loading
  }
}
