import styled from "styled-components"
import { createMediaQuery, BREAKPOINTS } from "../global-styles"

const Sidebar = styled.nav`
  position: fixed;
  top: 110px;
  left: 0;
  margin-left: 16px;
  display: none;

  ${createMediaQuery(BREAKPOINTS.xl, 'display: block')}
`

export default Sidebar