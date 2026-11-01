import React, { useEffect } from "react";
import { useSelector } from "react-redux";
import { useDispatch } from "react-redux";
import { createSelector } from "reselect";
import { changeLayoutMode } from "store/actions";

export const Frame = props => {
  const dispatch = useDispatch();

  const selectLayoutProperties = createSelector(
    (state) => state.Layout,
    (layout) => ({
      isPreloader: layout.isPreloader,
      layoutModeType: layout.layoutModeType,
      leftSideBarThemeImage: layout.leftSideBarThemeImage,
      leftSideBarType: layout.leftSideBarType,
      layoutWidth: layout.layoutWidth,
      topbarTheme: layout.topbarTheme,
      showRightSidebar: layout.showRightSidebar,
      leftSideBarTheme: layout.leftSideBarTheme,
    }));

  const {
    isPreloader,
    leftSideBarThemeImage,
    layoutWidth,
    leftSideBarType,
    topbarTheme,
    showRightSidebar,
    leftSideBarTheme,
    layoutModeType
  } = useSelector(selectLayoutProperties);

  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  // useEffect(() => {
  //   if (leftSideBarTheme) {
  //     dispatch(changeSidebarTheme(leftSideBarTheme));
  //   }
  // }, [leftSideBarTheme, dispatch]);

  useEffect(() => {
    if (layoutModeType) {
      dispatch(changeLayoutMode(layoutModeType));
    }
  }, [layoutModeType, dispatch]);

  return (<div style={{
    paddingLeft: 18,
    paddingRight: 18,
    paddingTop: 30,
    paddingBottom: 60,
  }}>
    {props.children}
  </div>);
}

export default Frame;