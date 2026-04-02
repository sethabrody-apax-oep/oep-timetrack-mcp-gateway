export async function paginatedFetch<T>(
  queryFn: (from: number, to: number) => any
): Promise<T[]> {
  const batchSize = 1000;
  let from = 0;
  const all: T[] = [];

  while (true) {
    const { data, error } = await queryFn(from, from + batchSize - 1);
    if (error) throw new Error(`Query error: ${error.message}`);
    if (!data?.length) break;
    all.push(...(data as T[]));
    if (data.length < batchSize) break;
    from += batchSize;
  }

  return all;
}
