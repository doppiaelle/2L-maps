/** NativeWind compiles global.css through Metro; TypeScript needs to know the
 *  side-effect import resolves to nothing at type level. */
declare module '*.css';
