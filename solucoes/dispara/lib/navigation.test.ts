import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'

// Mock next/navigation before importing the module under test
const mockPush = vi.fn()
const mockReplace = vi.fn()
const mockUseRouter = vi.fn(() => ({
  push: mockPush,
  replace: mockReplace,
}))
const mockUseParams = vi.fn()
const mockUsePathname = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => mockUseRouter(),
  useParams: () => mockUseParams(),
  usePathname: () => mockUsePathname(),
}))

// Import after mocking
import { useNavigate, useParams, useLocation } from './navigation'

describe('navigation adapters', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('useNavigate', () => {
    it('should return a navigate function', () => {
      const { result } = renderHook(() => useNavigate())
      expect(typeof result.current).toBe('function')
    })

    it('should call router.push by default', () => {
      const { result } = renderHook(() => useNavigate())
      const navigate = result.current

      navigate('/dashboard')

      expect(mockPush).toHaveBeenCalledTimes(1)
      expect(mockPush).toHaveBeenCalledWith('/dashboard')
      expect(mockReplace).not.toHaveBeenCalled()
    })

    it('should call router.push when replace is false', () => {
      const { result } = renderHook(() => useNavigate())
      const navigate = result.current

      navigate('/settings', { replace: false })

      expect(mockPush).toHaveBeenCalledTimes(1)
      expect(mockPush).toHaveBeenCalledWith('/settings')
      expect(mockReplace).not.toHaveBeenCalled()
    })

    it('should call router.replace when replace is true', () => {
      const { result } = renderHook(() => useNavigate())
      const navigate = result.current

      navigate('/login', { replace: true })

      expect(mockReplace).toHaveBeenCalledTimes(1)
      expect(mockReplace).toHaveBeenCalledWith('/login')
      expect(mockPush).not.toHaveBeenCalled()
    })

    describe.each([
      { path: '/', description: 'root path' },
      { path: '/dashboard', description: 'simple path' },
      { path: '/users/123', description: 'path with dynamic segment' },
      { path: '/a/b/c/d/e', description: 'deeply nested path' },
      { path: '/path?query=value', description: 'path with query string' },
      { path: '/path#section', description: 'path with hash' },
      { path: '/path?query=value#section', description: 'path with query and hash' },
      { path: '', description: 'empty path' },
    ])('with $description', ({ path }) => {
      it(`should navigate to "${path}"`, () => {
        const { result } = renderHook(() => useNavigate())
        result.current(path)
        expect(mockPush).toHaveBeenCalledWith(path)
      })
    })
  })

  describe('useParams', () => {
    it('should return empty object when params is null', () => {
      mockUseParams.mockReturnValue(null)

      const { result } = renderHook(() => useParams())

      expect(result.current).toEqual({})
    })

    it('should return empty object when params is undefined', () => {
      mockUseParams.mockReturnValue(undefined)

      const { result } = renderHook(() => useParams())

      expect(result.current).toEqual({})
    })

    it('should pass through string params unchanged', () => {
      mockUseParams.mockReturnValue({
        id: '123',
        slug: 'my-post',
      })

      const { result } = renderHook(() => useParams<{ id: string; slug: string }>())

      expect(result.current).toEqual({
        id: '123',
        slug: 'my-post',
      })
    })

    it('should convert array params to first element', () => {
      mockUseParams.mockReturnValue({
        segments: ['first', 'second', 'third'],
      })

      const { result } = renderHook(() => useParams<{ segments: string }>())

      expect(result.current).toEqual({
        segments: 'first',
      })
    })

    it('should convert empty array to empty string', () => {
      mockUseParams.mockReturnValue({
        segments: [],
      })

      const { result } = renderHook(() => useParams<{ segments: string }>())

      expect(result.current).toEqual({
        segments: '',
      })
    })

    it('should handle mixed param types', () => {
      mockUseParams.mockReturnValue({
        id: '456',
        tags: ['tag1', 'tag2'],
        empty: [],
      })

      const { result } = renderHook(() =>
        useParams<{ id: string; tags: string; empty: string }>()
      )

      expect(result.current).toEqual({
        id: '456',
        tags: 'tag1',
        empty: '',
      })
    })

    describe.each([
      {
        description: 'single string param',
        input: { id: '123' },
        expected: { id: '123' },
      },
      {
        description: 'multiple string params',
        input: { userId: 'u1', postId: 'p2' },
        expected: { userId: 'u1', postId: 'p2' },
      },
      {
        description: 'array with single element',
        input: { slug: ['only-one'] },
        expected: { slug: 'only-one' },
      },
      {
        description: 'array with multiple elements',
        input: { path: ['a', 'b', 'c'] },
        expected: { path: 'a' },
      },
      {
        description: 'empty object',
        input: {},
        expected: {},
      },
      {
        description: 'special characters in values',
        input: { name: 'hello%20world', encoded: 'a+b=c' },
        expected: { name: 'hello%20world', encoded: 'a+b=c' },
      },
      {
        description: 'numeric-like strings',
        input: { id: '0', count: '999' },
        expected: { id: '0', count: '999' },
      },
    ])('with $description', ({ input, expected }) => {
      it('should normalize correctly', () => {
        mockUseParams.mockReturnValue(input)
        const { result } = renderHook(() => useParams())
        expect(result.current).toEqual(expected)
      })
    })

    // Edge case: undefined values in the object (Next.js can return this)
    it('should skip undefined values', () => {
      mockUseParams.mockReturnValue({
        defined: 'value',
        undefinedParam: undefined,
      })

      const { result } = renderHook(() => useParams())

      // undefined is not a string or array, so it should be skipped
      expect(result.current).toEqual({
        defined: 'value',
      })
    })
  })

  describe('useLocation', () => {
    it('should return location object with pathname', () => {
      mockUsePathname.mockReturnValue('/dashboard')

      const { result } = renderHook(() => useLocation())

      expect(result.current).toEqual({
        pathname: '/dashboard',
        search: '',
        hash: '',
        state: null,
        key: 'default',
      })
    })

    it('should return correct pathname for root', () => {
      mockUsePathname.mockReturnValue('/')

      const { result } = renderHook(() => useLocation())

      expect(result.current.pathname).toBe('/')
    })

    it('should return correct pathname for nested routes', () => {
      mockUsePathname.mockReturnValue('/users/123/posts/456')

      const { result } = renderHook(() => useLocation())

      expect(result.current.pathname).toBe('/users/123/posts/456')
    })

    // Static properties that are always the same (simulating react-router-dom API)
    it('should always have empty search string', () => {
      mockUsePathname.mockReturnValue('/any-path')

      const { result } = renderHook(() => useLocation())

      expect(result.current.search).toBe('')
    })

    it('should always have empty hash string', () => {
      mockUsePathname.mockReturnValue('/any-path')

      const { result } = renderHook(() => useLocation())

      expect(result.current.hash).toBe('')
    })

    it('should always have null state', () => {
      mockUsePathname.mockReturnValue('/any-path')

      const { result } = renderHook(() => useLocation())

      expect(result.current.state).toBeNull()
    })

    it('should always have "default" as key', () => {
      mockUsePathname.mockReturnValue('/any-path')

      const { result } = renderHook(() => useLocation())

      expect(result.current.key).toBe('default')
    })

    describe.each([
      { pathname: '/', description: 'root' },
      { pathname: '/dashboard', description: 'simple path' },
      { pathname: '/users/123', description: 'path with param' },
      { pathname: '/a/b/c/d/e/f', description: 'deeply nested' },
      { pathname: '/path-with-dashes', description: 'path with dashes' },
      { pathname: '/path_with_underscores', description: 'path with underscores' },
    ])('with $description pathname', ({ pathname }) => {
      it(`should return pathname "${pathname}"`, () => {
        mockUsePathname.mockReturnValue(pathname)

        const { result } = renderHook(() => useLocation())

        expect(result.current.pathname).toBe(pathname)
      })
    })

    // Edge case: null pathname (shouldn't happen in practice, but defensive testing)
    it('should handle null pathname from usePathname', () => {
      mockUsePathname.mockReturnValue(null)

      const { result } = renderHook(() => useLocation())

      expect(result.current.pathname).toBeNull()
    })
  })
})
