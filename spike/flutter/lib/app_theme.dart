import 'package:flutter/material.dart';
abstract final class AppColors { static const mint=Color(0xFF00F5D4); static const mintDark=Color(0xFF2EC4B6); static const ink=Color(0xFF171923); static const muted=Color(0xFF7A7F8C); static const clay=Color(0xFFF7F8FA); static const darkSurface=Color(0xFF20232B); static const darkBackground=Color(0xFF12141A); }
class AppTheme {
 static ThemeData light()=>_theme(Brightness.light,AppColors.clay,Colors.white,AppColors.ink);
 static ThemeData dark()=>_theme(Brightness.dark,AppColors.darkBackground,AppColors.darkSurface,Colors.white);
 static ThemeData _theme(Brightness b,Color bg,Color surface,Color fg){final scheme=ColorScheme.fromSeed(seedColor:AppColors.mint,brightness:b,surface:surface);return ThemeData(useMaterial3:true,brightness:b,scaffoldBackgroundColor:bg,colorScheme:scheme.copyWith(primary:AppColors.mintDark,onPrimary:AppColors.ink,surface:surface,onSurface:fg),cardTheme:CardThemeData(color:surface,elevation:0,margin:EdgeInsets.zero,shape:RoundedRectangleBorder(borderRadius:BorderRadius.circular(24))),inputDecorationTheme:InputDecorationTheme(filled:true,fillColor:surface,border:OutlineInputBorder(borderRadius:BorderRadius.circular(18),borderSide:BorderSide.none)));}
}
