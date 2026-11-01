import React from "react";
import {
  DropdownItem,
  DropdownMenu,
  DropdownToggle,
  UncontrolledDropdown
} from "reactstrap";
import { OddSparkImage } from "./Material";

const ImageDrop = ({
  images: images,
  categories: categories,
  renderImage: renderImage,
  selectedImage: selectedImage,
  onSelectImage: onSelectImage,
  imagePerRow: imagePerRow,
  size: size=60,
  selectedImageSize: selectedImageSize=50,
  otherImageSize: otherImageSize=40,
  ...rest
}) => {
  const filterlist = [
    // "aether-shard",
    "aetheric-pellet",
    "aetheric-clump",
    "raw-aether",
    "refined-aether"
  ];
  const _imageRows = [];
  if (!categories) {
    images.map((_i, idx) => {
      let _row = images.slice(idx * imagePerRow, (idx + 1) * imagePerRow);
      _row.map(x => {
        x['category'] = 'other';
      });
      _imageRows.push(_row);
    });
  } else {
    const _images = images.filter(x => !filterlist.includes(x.id)).filter(x => x.craftable);
    categories.map(_c => {
      const _imageC = [];
      _images.map(x => {
        if (x.category === _c.id) {
          _imageC.push(x);
        }
      })
      _imageC.map((_i, idx) => {
        _imageRows.push(_imageC.slice(idx * imagePerRow, (idx + 1) * imagePerRow));
      })
    })
  }
  const imageRows = _imageRows.filter(x => x.length > 0);

  return (
    <UncontrolledDropdown group style={{
      height: size,
      width: size,
    }}>
      <DropdownToggle caret style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
      }}>
        <OddSparkImage id={selectedImage} size={selectedImageSize} uid={'select' + selectedImage} withPopover={false}/>
      </DropdownToggle>
        <DropdownMenu>
          {imageRows.map((row, index) => {
            return <div key={index}
              style={{
                display: "inline flex",
                flexFlow: "row nowrap",
                alignItems: "center",
                justifyItems: "center",
              }}>
              {row.map((image) => {
                return <DropdownItem
                  key={image.id + image.category}
                  onClick={() => onSelectImage(image)}>
                  <OddSparkImage id={image.id} size={otherImageSize} uid={'drop' + image.id} withPopover={false}/>
                </DropdownItem>
              })}
            </div>
          })}
    
        </DropdownMenu>
    </UncontrolledDropdown>
  );
}


export default ImageDrop;
